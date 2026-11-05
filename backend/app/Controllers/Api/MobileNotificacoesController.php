<?php

declare(strict_types=1);
namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;

/** Caixa de entrada do usuário autenticado via token Shield mobile. */
final class MobileNotificacoesController extends BaseController
{
    private function userId():int|ResponseInterface
    {
        $u=auth('tokens')->user();
        if(!$u||$u->isBanned())return $this->response->setStatusCode(401)
            ->setJSON(['message'=>'Sessão expirada.']);
        return (int)$u->id;
    }
    /**
     * Token FCM obtido pelo próprio aplicativo Android. Identidade sempre
     * derivada da sessão Shield mobile, jamais recebida do JSON.
     */
    public function registerDevice():ResponseInterface
    {
        $uid=$this->userId();if($uid instanceof ResponseInterface)return $uid;
        $data=$this->request->getJSON(true);
        if(!is_array($data))return $this->response->setStatusCode(422)
            ->setJSON(['message'=>'Dados de dispositivo inválidos.']);
        $token=(string)($data['token']??'');
        if(($data['plataforma']??'')!=='android' ||
           !preg_match('/^[A-Za-z0-9:_-]{60,512}$/D',$token)){
            return $this->response->setStatusCode(422)->setJSON(['message'=>'Token FCM Android inválido.']);
        }
        if(!service('throttler')->check('splash-fcm-register-'.$uid,20,MINUTE)){
            return $this->response->setStatusCode(429)
                ->setJSON(['message'=>'Muitas tentativas de registro de notificacoes. Tente mais tarde.']);
        }
        $db=db_connect();$hash=hash('sha256',$token);
        $current=$db->table('splash_push_nativo_dispositivos')
            ->where('token_hash',$hash)->get()->getRowArray();
        // Reenvios do mesmo token nao geram UPDATEs nem reabrem fila de avisos.
        if($current && (int)$current['user_id']===$uid && (int)$current['ativo']===1
           && strtotime((string)$current['atualizado_em'])>time()-600){
            return $this->response->setJSON(['message'=>'Dispositivo ja cadastrado.'])
                ->setHeader('Cache-Control','private, no-store');
        }
        $values=[
            'user_id'=>$uid,'token'=>$token,'plataforma'=>'android',
            'ativo'=>1,'atualizado_em'=>date('Y-m-d H:i:s'),
        ];
        if($current)$db->table('splash_push_nativo_dispositivos')
            ->where('id',$current['id'])->update($values);
        else $db->table('splash_push_nativo_dispositivos')
            ->insert(['token_hash'=>$hash,...$values]);

        // Um aparelho recém-autorizado pode receber os avisos ainda na fila.
        $db->table('splash_notificacoes')->where('user_id',$uid)
            ->where('enviado_em',null)->update(['tentativas'=>0]);
        return $this->response->setJSON(['message'=>'Notificações do Android ativadas para sua conta.'])
            ->setHeader('Cache-Control','private, no-store');
    }

    public function removeDevice():ResponseInterface
    {
        $uid=$this->userId();if($uid instanceof ResponseInterface)return $uid;
        $data=$this->request->getJSON(true);
        $token=(string)(is_array($data)?($data['token']??''):'');
        if(!preg_match('/^[A-Za-z0-9:_-]{60,512}$/D',$token)){
            return $this->response->setStatusCode(422)->setJSON(['message'=>'Token Android inválido.']);
        }
        db_connect()->table('splash_push_nativo_dispositivos')
            ->where('user_id',$uid)->where('token_hash',hash('sha256',$token))
            ->update(['ativo'=>0,'atualizado_em'=>date('Y-m-d H:i:s')]);
        return $this->response->setJSON(['message'=>'Dispositivo desvinculado.'])
            ->setHeader('Cache-Control','private, no-store');
    }

    /** Envia um push de teste apenas ao próprio usuário autenticado. */
    public function testDevice():ResponseInterface
    {
        $uid=$this->userId();if($uid instanceof ResponseInterface)return $uid;
        if(!service('throttler')->check('splash-push-test-'.$uid,2,MINUTE)){
            return $this->response->setStatusCode(429)
                ->setJSON(['message'=>'Aguarde antes de solicitar outro teste.']);
        }
        $db=db_connect();
        $count=$db->table('splash_push_nativo_dispositivos')
            ->where('user_id',$uid)->where('ativo',1)->countAllResults();
        if($count===0)return $this->response->setStatusCode(409)
            ->setJSON(['message'=>'Nenhum Android registrado. Autorize notificações e reabra o aplicativo.']);
        if(!\App\Libraries\EnvioPushNativoSplash::disponivel()){
            return $this->response->setStatusCode(503)
                ->setJSON(['message'=>'Firebase do servidor ainda não está configurado. Confira a conta de serviço no backend.']);
        }
        $success=\App\Libraries\EnvioPushNativoSplash::enviar([
            'user_id'=>$uid,'categoria'=>'TESTE','titulo'=>'Splash Next',
            'mensagem'=>'As notificações do Splash estão funcionando no Android.',
            'rota'=>'notificacoes','chave_evento'=>'TESTE_ANDROID',
        ]);
        if($success<1)return $this->response->setStatusCode(502)
            ->setJSON(['message'=>'Firebase não confirmou o envio. Confira o log do servidor e a configuração FCM.']);
        return $this->response->setJSON([
            'message'=>'Notificação enviada pelo Firebase. Confira a barra de notificações do Android.',
            'dispositivos_enviados'=>$success,
        ])->setHeader('Cache-Control','private, no-store');
    }

    public function index():ResponseInterface
    {
        $uid=$this->userId();if($uid instanceof ResponseInterface)return $uid;
        $db=db_connect();
        $items=$db->table('splash_notificacoes')->select(
            'id,chave_evento,categoria,titulo,mensagem,rota,valor_proprio,lido_em,criado_em')
            ->where('user_id',$uid)->orderBy('id','DESC')->limit(80)->get()->getResultArray();
        $unread=$db->table('splash_notificacoes')->where('user_id',$uid)
            ->where('lido_em',null)->countAllResults();
        return $this->response->setJSON(['avisos'=>$items,'nao_lidas'=>(int)$unread])
            ->setHeader('Cache-Control','no-store');
    }
    public function read(int|string $id):ResponseInterface
    {
        $uid=$this->userId();if($uid instanceof ResponseInterface)return $uid;
        $number=filter_var($id,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($number===false)return $this->response->setStatusCode(404)->setJSON(['message'=>'Aviso inválido.']);
        db_connect()->table('splash_notificacoes')->where('id',(int)$number)
            ->where('user_id',$uid)->where('lido_em',null)->update(['lido_em'=>date('Y-m-d H:i:s')]);
        return $this->response->setJSON(['message'=>'Notificação lida.']);
    }
    public function readAll():ResponseInterface
    {
        $uid=$this->userId();if($uid instanceof ResponseInterface)return $uid;
        db_connect()->table('splash_notificacoes')->where('user_id',$uid)
            ->where('lido_em',null)->update(['lido_em'=>date('Y-m-d H:i:s')]);
        return $this->response->setJSON(['message'=>'Todas as notificações foram lidas.']);
    }
}
