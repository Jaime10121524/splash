<?php
declare(strict_types=1);
namespace App\Libraries;

use Throwable;

/**
 * Persistência idempotente por user + evento.
 * A mensagem nunca contém dados pessoais do cliente nem valores de terceiros.
 */
final class AvisosSplash
{
    public static function venda(int $operationId,bool $apurada=false): void
    {
        try{
            $db=db_connect();
            $op=$db->table('venda_operacoes')->where('id',$operationId)->get()->getRowArray();
            if(!$op || $op['situacao']!=='VENDA')return;
            $ids=[];
            foreach(['corretor_pessoa_id','segundo_corretor_pessoa_id','atendente_pessoa_id',
                'atendente_adicional_pessoa_id','gerente_pessoa_id'] as $key){
                if((int)($op[$key]??0)>0)$ids[]=(int)$op[$key];
            }
            $rates=$db->table('comissao_rateios')->where('operacao_id',$operationId)->get()->getResultArray();
            foreach($rates as $rate)$ids[]=(int)$rate['beneficiario_pessoa_id'];
            $ids=array_values(array_unique($ids));if(!$ids)return;
            $people=$db->table('pessoas')->select('id,user_id')->whereIn('id',$ids)
                ->where('ativo',1)->where('user_id IS NOT NULL',null,false)->get()->getResultArray();
            if($apurada){
                $sum=0;
                foreach($db->table('venda_recebimentos')->select('tipo,valor')
                    ->where('operacao_id',$operationId)->get()->getResultArray() as $m){
                    $sum+=($m['tipo']==='ENTRADA'?1:-1)*VendaMoney::cents((string)$m['valor'],true);
                }
                if($sum!==VendaMoney::cents((string)$op['valor_cobrado'],true))return;
                $auto=$db->table('comissao_auto_apuracoes')->where('operacao_id',$operationId)->get()->getRowArray();
                // Não divulgar um valor do titular enquanto as participações
                // ainda precisam de apuração ou revisão.
                if(!$auto || ($auto['status']??'')==='REVISAR')return;
            }
            $due=[];
            $root=(int)$op['corretor_pessoa_id'];
            $base=$op['comissao_ajustada']??$op['comissao_prevista'];
            if($apurada && $base!==null){
                $owner=VendaMoney::cents((string)$base,true);
                foreach($rates as $rate){
                    $value=VendaMoney::cents((string)$rate['valor'],true);
                    $beneficiary=(int)$rate['beneficiario_pessoa_id'];
                    $due[$beneficiary]=($due[$beneficiary]??0)+$value;
                    if((int)$rate['responsavel_pessoa_id']===$root)$owner-=$value;
                }
                $due[$root]=($due[$root]??0)+$owner;
            }
            if($apurada){
                $paid=[];
                foreach($db->table('comissao_titular_movimentos')
                    ->select('corretor_pessoa_id,tipo,valor')->where('operacao_id',$operationId)
                    ->get()->getResultArray() as $m){
                    $person=(int)$m['corretor_pessoa_id'];
                    $paid[$person]=($paid[$person]??0)+($m['tipo']==='PAGAMENTO'?1:-1)
                        *VendaMoney::cents((string)$m['valor'],true);
                }
                if($rates){
                    $byRate=[];
                    foreach($rates as $r)$byRate[(int)$r['id']]=(int)$r['beneficiario_pessoa_id'];
                    foreach($db->table('comissao_repasses')->select('rateio_id,tipo,valor')
                        ->whereIn('rateio_id',array_keys($byRate))->get()->getResultArray() as $m){
                        $person=$byRate[(int)$m['rateio_id']];
                        $paid[$person]=($paid[$person]??0)+($m['tipo']==='PAGAMENTO'?1:-1)
                            *VendaMoney::cents((string)$m['valor'],true);
                    }
                }
                foreach($due as $person=>$gross)$due[$person]=max(0,$gross-($paid[$person]??0));
            }
            $titulo=trim((string)$op['numero_titulo'].' '.(string)$op['sigla_plano']);
            $kind=$apurada?'COMISSAO_APURADA':'VENDA_REGISTRADA';
            $stamp=date('Y-m-d H:i:s');
            foreach($people as $person){
                $uid=(int)$person['user_id'];$pid=(int)$person['id'];
                $amount=$apurada?($due[$pid]??null):null;
                // Não atribuir valor zero a alguém cujo rateio ainda não existe.
                if($apurada && $amount===null)continue;
                $message=$apurada
                    ?'Sua comissão a receber nesta venda: R$ '.number_format(max(0,$amount)/100,2,',','.').'.'
                    :'Você participa de uma nova venda. Comissão a apurar conforme pagamento e fechamento.';
                $event=$kind.':'.$operationId;
                $exists=$db->table('splash_notificacoes')->where('user_id',$uid)
                    ->where('chave_evento',$event)->countAllResults();
                if($exists)continue;
                $db->table('splash_notificacoes')->insert([
                    'user_id'=>$uid,'chave_evento'=>$event,'categoria'=>$kind,
                    'titulo'=>($apurada?'Comissão apurada':'Nova venda').' · '.$titulo,
                    'mensagem'=>$message,'rota'=>'vendas',
                    'valor_proprio'=>$amount===null?null:VendaMoney::decimal(max(0,$amount)),
                    'criado_em'=>$stamp,
                ]);
            }
        }catch(Throwable $e){
            log_message('error','Aviso SPLASH venda: {message}',['message'=>$e->getMessage()]);
        }
    }

    public static function alertaUsuario(int $userId,string $key,string $type,string $title,string $body,string $route):void
    {
        try{
            $db=db_connect();
            if(!$db->table('splash_notificacoes')->where('user_id',$userId)
                ->where('chave_evento',$key)->countAllResults()){
                $db->table('splash_notificacoes')->insert([
                    'user_id'=>$userId,'chave_evento'=>$key,'categoria'=>$type,
                    'titulo'=>$title,'mensagem'=>$body,'rota'=>$route,
                    'criado_em'=>date('Y-m-d H:i:s'),
                ]);
            }
        }catch(Throwable $e){log_message('error','Aviso SPLASH: {message}',['message'=>$e->getMessage()]);}
    }
}
