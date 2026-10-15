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
        $webAvailable=self::disponivel();
        $nativeAvailable=EnvioPushNativoSplash::disponivel();
        if(!$webAvailable && !$nativeAvailable)return ['enviados'=>0,'erro'=>'Serviço Push ainda não configurado. Avisos internos disponíveis.'];
        $db=db_connect();$sent=0;$failed=0;
        $list=$db->table('splash_notificacoes')->where('enviado_em',null)
            ->where('tentativas <',5)->orderBy('id','ASC')->limit($limit)->get()->getResultArray();
        // Falha de configuracao VAPID nao pode bloquear o Firebase Android.
        $push=null;$webSetupError=false;
        if($webAvailable){
            try{
                $push=new WebPush(['VAPID'=>[
                    'subject'=>'mailto:'.env('SPLASH_VAPID_SUBJECT'),
                    'publicKey'=>env('SPLASH_VAPID_PUBLIC'),
                    'privateKey'=>env('SPLASH_VAPID_PRIVATE'),
                ]]);
            }catch(Throwable $e){
                $webAvailable=false;$webSetupError=true;
                log_message('error','SPLASH Web Push configuracao: {class} - {error}',[
                    'class'=>get_class($e),'error'=>$e->getMessage(),
                ]);
            }
        }
        if(!$webAvailable && !$nativeAvailable){
            return ['enviados'=>0,'falhas'=>0,'erro'=>'Falha ao inicializar Web Push. Verifique o log do CodeIgniter.'];
        }
        $stage='consulta_usuario';
        try{
            foreach($list as $notice){
                $stage='consulta_usuario';
                $owner=auth()->getProvider()->findById((int)$notice['user_id']);
                if(!$owner||$owner->isBanned())continue;
                $stage='consulta_dispositivos_web';
                $subscriptions=$db->table('splash_push_dispositivos')
                    ->where('user_id',(int)$notice['user_id'])->where('ativo',1)
                    ->limit(8)->get()->getResultArray();
                $stage='consulta_dispositivos_android';
                $hasNative=$nativeAvailable && $db->table('splash_push_nativo_dispositivos')
                    ->where('user_id',(int)$notice['user_id'])->where('ativo',1)
                    ->countAllResults()>0;
                // Sem aparelho cadastrado não constitui falha de envio.
                if(!$subscriptions && !$hasNative)continue;
                $stage='envio_firebase_android';
                $success=$hasNative?EnvioPushNativoSplash::enviar($notice):0;
                $stage='envio_web_push';
                foreach(($webAvailable?$subscriptions:[]) as $sub){
                    try{
                        $data=json_decode((string)$sub['assinatura_json'],true,512,JSON_THROW_ON_ERROR);
                        $payload=json_encode([
                            'title'=>$notice['titulo'],'body'=>$notice['mensagem'],
                            'category'=>$notice['categoria'],
                            'url'=>'/?go='.rawurlencode((string)$notice['rota']),'tag'=>$notice['chave_evento'],
                        ],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                        $result=$push->sendOneNotification(Subscription::create($data),$payload,
                            ['TTL'=>86400,'urgency'=>$notice['categoria']==='VENDA_PAGA'?'high':'normal']);
                        if($result->isSuccess()){$success++;continue;}
                        if($result->isSubscriptionExpired()){
                            $db->table('splash_push_dispositivos')->where('id',$sub['id'])->update(['ativo'=>0]);
                        }
                    }catch(Throwable $e){log_message('error','Push SPLASH dispositivo: {error}',['error'=>$e->getMessage()]);}
                }
                $stage='registro_envio';
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
            log_message('error','Push SPLASH etapa {stage}: {class} - {error}',[
                'stage'=>$stage,'class'=>get_class($e),'error'=>$e->getMessage(),
            ]);
            return ['enviados'=>$sent,'falhas'=>$failed,'erro'=>'Falha na etapa '.$stage.'. Confira o log do CodeIgniter.'];
        }
        $result=['enviados'=>$sent,'falhas'=>$failed];
        if($webSetupError)$result['aviso']='Web Push não inicializou; o envio Firebase Android foi processado separadamente.';
        return $result;
    }
}
