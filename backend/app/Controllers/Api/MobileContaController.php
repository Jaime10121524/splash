<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

/** Perfil do token mobile, sem criar sessão web e sem divulgar dados de terceiros. */
final class MobileContaController extends BaseController
{
    private function error(int $status,string $message):ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON(['message'=>$message])
            ->setHeader('Cache-Control','no-store');
    }
    private function actor():object|ResponseInterface
    {
        $u=auth('tokens')->user();
        return $u&&!$u->isBanned()?$u:$this->error(401,'Sessão expirada.');
    }
    public function show():ResponseInterface
    {
        $u=$this->actor();if($u instanceof ResponseInterface)return $u;
        return $this->response->setJSON(['perfil'=>[
            'username'=>(string)$u->username,
            'email'=>(string)$u->email,
            'foto_disponivel'=>$this->photoExists((int)$u->id),
        ]])->setHeader('Cache-Control','no-store');
    }
    private function photoExists(int $id):bool
    {
        foreach(['jpg','png','webp'] as $ext)
            if(is_file(WRITEPATH.'uploads/splash/perfis/'.$id.'.'.$ext))return true;
        return false;
    }
    public function update():ResponseInterface
    {
        $u=$this->actor();if($u instanceof ResponseInterface)return $u;
        if(!service('throttler')->check('splash-mobile-profile-'.$u->id,10,HOUR))
            return $this->error(429,'Muitas tentativas. Tente novamente mais tarde.');
        $p=$this->request->getJSON(true);
        if(!is_array($p))return $this->error(422,'Dados inválidos.');
        $email=strtolower(trim((string)($p['email']??'')));
        $password=(string)($p['nova_senha']??'');
        $current=(string)($p['senha_atual']??'');
        if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254)
            return $this->error(422,'E-mail inválido.');
        if($password!=='' && (strlen($password)<8||strlen($password)>128||
            !preg_match('/[A-Z]/',$password)||!preg_match('/[0-9]/',$password)))
            return $this->error(422,'Senha nova: mínimo de 8 caracteres, maiúscula e número.');
        $row=db_connect()->table('auth_identities')->select('secret2')
            ->where('user_id',(int)$u->id)->where('type','email_password')->get()->getRowArray();
        if(!$row||!password_verify($current,(string)$row['secret2']))
            return $this->error(422,'Senha atual incorreta.');
        try{
            $provider=auth()->getProvider();
            $used=$provider->findByCredentials(['email'=>$email]);
            if($used&&(int)$used->id!==(int)$u->id)
                return $this->error(409,'Este e-mail já está em uso.');
            $changes=['email'=>$email];
            if($password!=='')$changes['password']=$password;
            $u->fill($changes);$provider->save($u);
            return $this->response->setJSON([
                'message'=>'Perfil atualizado com sucesso.',
                'perfil'=>['username'=>(string)$u->username,'email'=>$email,
                    'foto_disponivel'=>$this->photoExists((int)$u->id)],
            ])->setHeader('Cache-Control','no-store');
        }catch(Throwable $e){
            log_message('error','SPLASH perfil mobile: {error}',['error'=>$e->getMessage()]);
            return $this->error(500,'Não foi possível salvar o perfil.');
        }
    }
}
