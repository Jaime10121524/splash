<?php
declare(strict_types=1);
namespace App\Libraries;

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;
use Throwable;

final class EnvioPushSplash
{
    public static function disponivel():bool
    {
        return class_exists(WebPush::class) &&
            strlen((string)env('SPLASH_VAPID_PUBLIC'))>50 &&
            strlen((string)env('SPLASH_VAPID_PRIVATE'))>30 &&
            filter_var((string)env('SPLASH_VAPID_SUBJECT'),FILTER_VALIDATE_EMAIL);
    }
    public static function enviar(int $limit=35):array
    {
        if(!self::disponivel())return ['enviados'=>0,'erro'=>'Web Push não configurado no servidor. Avisos internos permanecem disponíveis.'];
        $db=db_connect();$sent=0;$failed=0;
        $list=$db->table('splash_notificacoes')->where('enviado_em',null)
            ->where('tentativas <',5)->orderBy('id','ASC')->limit($limit)->get()->getResultArray();
        try{
            $push=new WebPush(['VAPID'=>[
                'subject'=>'mailto:'.env('SPLASH_VAPID_SUBJECT'),
                'publicKey'=>env('SPLASH_VAPID_PUBLIC'),
                'privateKey'=>env('SPLASH_VAPID_PRIVATE'),
            ]]);
            foreach($list as $notice){
                $subscriptions=$db->table('splash_push_dispositivos')
                    ->where('user_id',(int)$notice['user_id'])->where('ativo',1)
                    ->limit(8)->get()->getResultArray();
                if(!$subscriptions)continue; // continua visível no painel; pode instalar depois
                $success=0;
                foreach($subscriptions as $sub){
                    try{
                        $data=json_decode((string)$sub['assinatura_json'],true,512,JSON_THROW_ON_ERROR);
                        $payload=json_encode([
                            'title'=>$notice['titulo'],'body'=>$notice['mensagem'],
                            'url'=>'/','tag'=>$notice['chave_evento'],
                        ],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                        $result=$push->sendOneNotification(Subscription::create($data),$payload,
                            ['TTL'=>86400,'urgency'=>'normal']);
                        if($result->isSuccess()){$success++;continue;}
                        if($result->isSubscriptionExpired()){
                            $db->table('splash_push_dispositivos')->where('id',$sub['id'])->update(['ativo'=>0]);
                        }
                    }catch(Throwable $e){log_message('error','Push SPLASH dispositivo: {error}',['error'=>$e->getMessage()]);}
                }
                if($success){
                    $db->table('splash_notificacoes')->where('id',$notice['id'])
                        ->update(['enviado_em'=>date('Y-m-d H:i:s')]);
                    $sent++;
                }else{
                    $db->table('splash_notificacoes')->where('id',$notice['id'])
                        ->set('tentativas','tentativas+1',false)->update();
                    $failed++;
                }
            }
        }catch(Throwable $e){
            log_message('error','Push SPLASH: {error}',['error'=>$e->getMessage()]);
            return ['enviados'=>$sent,'falhas'=>$failed,'erro'=>'Falha na entrega Web Push'];
        }
        return ['enviados'=>$sent,'falhas'=>$failed];
    }
}
