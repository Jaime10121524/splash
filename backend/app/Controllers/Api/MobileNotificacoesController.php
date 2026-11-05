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
        $db=db_connect();$hash=hash('sha256',$token);
        $current=$db->table('splash_push_nativo_dispositivos')
            ->where('token_hash',$hash)->get()->getRowArray();
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
