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
