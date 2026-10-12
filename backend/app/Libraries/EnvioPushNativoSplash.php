<?php
declare(strict_types=1);
namespace App\Libraries;

use Throwable;

/**
 * FCM HTTP v1 com service account privada. Compatível com PHP cURL em
 * hospedagem compartilhada; não exige daemon ou processo Node.
 */
final class EnvioPushNativoSplash
{
    private static ?string $accessToken=null;
    public static function disponivel():bool
    {
        $file=(string)(env('SPLASH_FIREBASE_SERVICE_ACCOUNT')?:'');
        $real=$file!==''?realpath($file):false;
        $public=realpath(FCPATH);
        return extension_loaded('curl') && extension_loaded('openssl')
            && $real!==false && is_readable($real)
            && !preg_match('~[/\\\\]public_html(?:[/\\\\]|$)~i',$real)
            && (!$public || !str_starts_with($real,$public));
    }
    private static function b64(string $data):string
    {
        return rtrim(strtr(base64_encode($data),'+/','-_'),'=');
    }
    private static function config():array
    {
        if(!self::disponivel())throw new \RuntimeException('Firebase não configurado.');
        $file=(string)env('SPLASH_FIREBASE_SERVICE_ACCOUNT');
        $json=json_decode((string)file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
        if(($json['type']??'')!=='service_account'
            || !preg_match('/^[a-z0-9-]+$/D',(string)($json['project_id']??''))
            || !str_ends_with((string)($json['client_email']??''),'.gserviceaccount.com')
            || !str_contains((string)($json['private_key']??''),'BEGIN PRIVATE KEY')){
            throw new \RuntimeException('Service account Firebase inválida.');
        }
        return $json;
    }
    private static function request(string $url,array $headers,string $payload):array
    {
        $ch=curl_init($url);
        if($ch===false)throw new \RuntimeException('cURL indisponível.');
        curl_setopt_array($ch,[
            CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$payload,CURLOPT_HTTPHEADER=>$headers,
            CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>14,
            CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
        ]);
        $raw=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
        curl_close($ch);
        if(!is_string($raw))throw new \RuntimeException('Falha de conexão Firebase.');
        $data=json_decode($raw,true);
        return ['status'=>$status,'data'=>is_array($data)?$data:[]];
    }
    private static function token(array $cfg):string
    {
        if(self::$accessToken)return self::$accessToken;
        $now=time();
        $header=self::b64(json_encode(['alg'=>'RS256','typ'=>'JWT'],JSON_THROW_ON_ERROR));
        $claims=self::b64(json_encode([
            'iss'=>$cfg['client_email'],'scope'=>'https://www.googleapis.com/auth/firebase.messaging',
            'aud'=>'https://oauth2.googleapis.com/token','iat'=>$now,'exp'=>$now+3300,
        ],JSON_THROW_ON_ERROR));
        $input=$header.'.'.$claims;
        if(!openssl_sign($input,$signature,$cfg['private_key'],OPENSSL_ALGO_SHA256))
            throw new \RuntimeException('Falha ao assinar token Firebase.');
        $jwt=$input.'.'.self::b64($signature);
        $r=self::request('https://oauth2.googleapis.com/token',
            ['Content-Type: application/x-www-form-urlencoded'],
            http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'=>$jwt],'','&',PHP_QUERY_RFC3986));
        if($r['status']!==200||empty($r['data']['access_token']))
            throw new \RuntimeException('Firebase OAuth recusou a autenticação.');
        return self::$accessToken=(string)$r['data']['access_token'];
    }

    public static function enviar(array $notice):int
    {
        if(!self::disponivel())return 0;
        try{
            $cfg=self::config();$access=self::token($cfg);$ok=0;
            $db=db_connect();
            $devices=$db->table('splash_push_nativo_dispositivos')
                ->where('user_id',(int)$notice['user_id'])->where('ativo',1)
                ->limit(8)->get()->getResultArray();
            foreach($devices as $d){
                $url='https://fcm.googleapis.com/v1/projects/'.$cfg['project_id'].'/messages:send';
                $body=json_encode(['message'=>[
                    'token'=>$d['token'],
                    'notification'=>['title'=>$notice['titulo'],'body'=>$notice['mensagem']],
                    'data'=>['route'=>(string)$notice['rota'],'event'=>(string)$notice['chave_evento']],
                    'android'=>['priority'=>'normal'],
                ]],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                $resp=self::request($url,['Authorization: Bearer '.$access,'Content-Type: application/json'],$body);
                if($resp['status']===200){$ok++;continue;}
                $code=(string)($resp['data']['error']['status']??'');
                if(in_array($code,['NOT_FOUND','UNREGISTERED'],true)){
                    $db->table('splash_push_nativo_dispositivos')
                        ->where('id',$d['id'])->update(['ativo'=>0]);
                }
                // Sem logs de tokens, credenciais, nome de cliente ou payload privado.
            }
            return $ok;
        }catch(Throwable $e){
            log_message('error','FCM SPLASH indisponível: {reason}',['reason'=>$e->getMessage()]);
            return 0;
        }
    }
}
