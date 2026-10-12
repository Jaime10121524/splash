<?php
declare(strict_types=1);
namespace App\Controllers\Api;
use App\Libraries\EnvioPushSplash;
use CodeIgniter\HTTP\ResponseInterface;

final class NotificacoesController extends CommercialBaseController
{
    private function uid():int|ResponseInterface
    {
        $u=auth('session')->user();
        if(!$u||$u->isBanned())return $this->errorResponse(401,'Sessão expirada.');
        return (int)$u->id;
    }
    public function index():ResponseInterface
    {
        $u=$this->uid();if($u instanceof ResponseInterface)return $u;
        $db=db_connect();
        $rows=$db->table('splash_notificacoes')->select('id,categoria,titulo,mensagem,rota,valor_proprio,lido_em,criado_em')
            ->where('user_id',$u)->orderBy('id','DESC')->limit(80)->get()->getResultArray();
        $unread=$db->table('splash_notificacoes')->where('user_id',$u)->where('lido_em',null)->countAllResults();
        return $this->response->setJSON([
            'avisos'=>$rows,'nao_lidas'=>$unread,
            'push_disponivel'=>EnvioPushSplash::disponivel(),
            'vapid_publica'=>(string)(env('SPLASH_VAPID_PUBLIC')?:''),
        ])->setHeader('Cache-Control','no-store');
    }
    public function marcar(int|string $id):ResponseInterface
    {
        $u=$this->uid();if($u instanceof ResponseInterface)return $u;
        db_connect()->table('splash_notificacoes')->where('id',(int)$id)
            ->where('user_id',$u)->update(['lido_em'=>date('Y-m-d H:i:s')]);
        return $this->responseOK('Notificação lida.');
    }
    public function registrarDispositivo():ResponseInterface
    {
        $u=$this->uid();if($u instanceof ResponseInterface)return $u;
        $data=$this->jsonPayload();$entry=$data['assinatura']??null;
        if(!is_array($entry))return $this->errorResponse(422,'Inscrição inválida.');
        $endpoint=(string)($entry['endpoint']??'');
        $key=(string)($entry['keys']['p256dh']??'');$auth=(string)($entry['keys']['auth']??'');
        $hostname=strtolower((string)(parse_url($endpoint,PHP_URL_HOST)?:''));
        $allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
        $validHost=in_array($hostname,$allowed,true) ||
            str_ends_with($hostname,'.push.apple.com') ||
            str_ends_with($hostname,'.notify.windows.com');
        if(!str_starts_with($endpoint,'https://')||!$validHost||strlen($endpoint)>1800
           ||strlen($endpoint)<40||strlen($key)<30||strlen($auth)<12){
            return $this->errorResponse(422,'Provedor Web Push ou chaves de inscrição inválidas.');
        }
        $hash=hash('sha256',$endpoint);$db=db_connect();
        $existing=$db->table('splash_push_dispositivos')->where('endpoint_hash',$hash)->get()->getRowArray();
        $record=['user_id'=>$u,'assinatura_json'=>json_encode($entry,JSON_THROW_ON_ERROR),
            'ativo'=>1,'atualizado_em'=>date('Y-m-d H:i:s')];
        if($existing)$db->table('splash_push_dispositivos')->where('id',$existing['id'])->update($record);
        else $db->table('splash_push_dispositivos')->insert(['endpoint_hash'=>$hash,...$record]);
        return $this->responseOK('Este celular receberá notificações quando o navegador permitir.');
    }
    public function removerDispositivo():ResponseInterface
    {
        $u=$this->uid();if($u instanceof ResponseInterface)return $u;
        $entry=$this->jsonPayload();$endpoint=(string)($entry['endpoint']??'');
        if($endpoint==='')return $this->errorResponse(422,'Inscrição ausente.');
        db_connect()->table('splash_push_dispositivos')->where('user_id',$u)
            ->where('endpoint_hash',hash('sha256',$endpoint))->update(['ativo'=>0]);
        return $this->responseOK('Notificações deste aparelho desativadas.');
    }
}
