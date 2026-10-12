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

}
