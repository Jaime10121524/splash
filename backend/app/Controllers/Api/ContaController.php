<?php
declare(strict_types=1);
namespace App\Controllers\Api;
use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
final class ContaController extends BaseController
{
    private function answer(array $data,int $code=200):ResponseInterface {
        return $this->response->setStatusCode($code)->setJSON($data)->setHeader('Cache-Control','no-store');
    }
    private function currentUser(){
        $u=auth('session')->user();
        return $u && !$u->isBanned()?$u:null;
    }
    private function validPassword(string $s):bool{
        return strlen($s)>=8&&strlen($s)<=128&&preg_match('/[A-Z]/',$s)&&preg_match('/[0-9]/',$s);
    }
    public function perfil():ResponseInterface{
        $u=$this->currentUser();
        if(!$u)return $this->answer(['message'=>'Sessão expirada.'],401);
        return $this->answer(['perfil'=>['username'=>$u->username,'email'=>$u->email]]);
    }
    private function senhaConfere(int $id,string $password):bool{
        $row=db_connect()->table('auth_identities')->select('secret2')
            ->where('user_id',$id)->where('type','email_password')->get()->getRowArray();
        return $row && password_verify($password,(string)$row['secret2']);
    }
    public function atualizar():ResponseInterface {
        $u=$this->currentUser();
        if(!$u)return $this->answer(['message'=>'Sessão expirada.'],401);
        if(!service('throttler')->check('splash-profile-'.$u->id,10,HOUR))
            return $this->answer(['message'=>'Muitas tentativas.'],429);
        $p=$this->request->getJSON(true)??[];
        $email=strtolower(trim((string)($p['email']??'')));
        $password=(string)($p['nova_senha']??'');
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254
            ||($password!==''&&!$this->validPassword($password)))
            return $this->answer(['message'=>'Email inválido ou senha fora do padrão (8 caracteres, maiúscula e número).'],422);
        if(!$this->senhaConfere((int)$u->id,(string)($p['senha_atual']??'')))
            return $this->answer(['message'=>'Senha atual incorreta.'],422);
        try {
            $provider=auth()->getProvider();
            $used=$provider->findByCredentials(['email'=>$email]);
            if($used&&(int)$used->id!==(int)$u->id)
                return $this->answer(['message'=>'Esse email já está em uso.'],409);
            $changes=['email'=>$email];
            if($password!=='')$changes['password']=$password;
            $u->fill($changes);$provider->save($u);
            return $this->answer(['message'=>'Perfil atualizado com sucesso.']);
        }catch(\Throwable $e){
            log_message('error','Falha ao salvar perfil: {message}',['message'=>$e->getMessage()]);
            return $this->answer(['message'=>'Não foi possível salvar seu perfil.'],500);
        }
    }

    public function solicitarRecuperacao():ResponseInterface {
        $out=['message'=>'Se o email estiver cadastrado, enviaremos um link de recuperação.'];
        if(!service('throttler')->check('splash-recover-'.sha1($this->request->getIPAddress()),5,HOUR))
            return $this->answer($out);
        $p=$this->request->getJSON(true)??[];
        $email=strtolower(trim((string)($p['email']??'')));
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254)return $this->answer($out);
        try{
            $u=auth()->getProvider()->findByCredentials(['email'=>$email]);
            if(!$u||$u->isBanned())return $this->answer($out);
            $db=db_connect();
            if($db->table('splash_recuperacao_senha')->where('user_id',(int)$u->id)
                ->where('criado_em >=',date('Y-m-d H:i:s',time()-300))->countAllResults())
                return $this->answer($out);
            $token=bin2hex(random_bytes(32));
            $db->table('splash_recuperacao_senha')->insert([
                'user_id'=>(int)$u->id,'token_hash'=>hash('sha256',$token),
                'expira_em'=>date('Y-m-d H:i:s',time()+1800),'criado_em'=>date('Y-m-d H:i:s')
            ]);
            $base=rtrim((string)(env('SPLASH_FRONTEND_URL')?:config('App')->baseURL),'/');
            $mail=service('email');
            $mail->setFrom((string)(env('SPLASH_MAIL_FROM')?:config('Email')->fromEmail),'SPLASH');
            $mail->setTo((string)$u->email);
            $mail->setSubject('SPLASH - Recuperacao de senha');
            $mail->setMessage("Para criar uma senha nova, acesse em ate 30 minutos:\n".$base.'/?recuperar='.$token."\nSe nao solicitou, ignore.");
            if(!$mail->send())log_message('error','Falha SMTP na recuperação SPLASH.');
        }catch(\Throwable $e){
            log_message('error','Recuperação SPLASH: {message}',['message'=>$e->getMessage()]);
        }
        return $this->answer($out);
    }

    public function redefinirSenha():ResponseInterface {
        if(!service('throttler')->check('splash-reset-'.sha1($this->request->getIPAddress()),10,HOUR))
            return $this->answer(['message'=>'Muitas tentativas.'],429);
        $p=$this->request->getJSON(true)??[];
        $token=(string)($p['token']??'');
        $password=(string)($p['nova_senha']??'');
        if(!preg_match('/^[a-f0-9]{64}$/D',$token)||!$this->validPassword($password))
            return $this->answer(['message'=>'Link inválido ou senha fora do padrão.'],422);
        $db=db_connect();
        $db->transBegin();
        try{
            $row=$db->query('SELECT * FROM splash_recuperacao_senha WHERE token_hash=? FOR UPDATE',
                [hash('sha256',$token)])->getRowArray();
            if(!$row||$row['usado_em']!==null||$row['expira_em']<date('Y-m-d H:i:s')){
                $db->transRollback();
                return $this->answer(['message'=>'Link expirado ou utilizado. Solicite outro.'],422);
            }
            $provider=auth()->getProvider();$u=$provider->findById((int)$row['user_id']);
            if(!$u||$u->isBanned()){
                $db->transRollback();
                return $this->answer(['message'=>'Não foi possível recuperar essa conta.'],422);
            }
            $u->fill(['password'=>$password]);$provider->save($u);
            $db->table('splash_recuperacao_senha')->where('user_id',(int)$u->id)
                ->where('usado_em',null)->update(['usado_em'=>date('Y-m-d H:i:s')]);
            if($db->transStatus()===false)throw new \RuntimeException('Transação inválida.');
            $db->transCommit();
            return $this->answer(['message'=>'Senha redefinida. Entre novamente.']);
        }catch(\Throwable $e){
            $db->transRollback();
            log_message('error','Recuperação SPLASH: {message}',['message'=>$e->getMessage()]);
            return $this->answer(['message'=>'Erro ao redefinir senha.'],500);
        }
    }

}
