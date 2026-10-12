<?php
declare(strict_types=1);

namespace App\Libraries;

use Throwable;

/**
 * Eventos de visitas com destinatários vinculados e conteúdo sem PII do cliente.
 * Notificações são idempotentes por chave do histórico, não por data do clique.
 */
final class VisitasAvisos
{
    public static function registrar(int $visitaId,string $evento):void
    {
        try{
            $db=db_connect();
            $v=$db->table('visitas v')
                ->select('v.id,v.status,v.corretor_pessoa_id,v.segundo_corretor_pessoa_id,v.atendente_pessoa_id,v.atendente_adicional_pessoa_id,v.motivo_nao_venda_id,v.retorno_previsto')
                ->where('v.id',$visitaId)->get()->getRowArray();
            if(!$v)return;
            $roles=[];
            foreach(['corretor_pessoa_id','segundo_corretor_pessoa_id','atendente_pessoa_id','atendente_adicional_pessoa_id'] as $field){
                $id=(int)($v[$field]??0);
                if($id>0)$roles[]=$id;
            }
            $users=[];
            if($roles){
                foreach($db->table('pessoas')->select('user_id')->whereIn('id',array_unique($roles))
                    ->where('ativo',1)->where('user_id IS NOT NULL',null,false)->get()->getResultArray() as $r){
                    $users[]=(int)$r['user_id'];
                }
            }
            // O administrador único acompanha todas as chegadas e mudanças.
            foreach($db->table('auth_groups_users')->select('user_id')
                ->where('group','admin')->get()->getResultArray() as $r){
                $users[]=(int)$r['user_id'];
            }
            $users=array_values(array_unique(array_filter($users)));
            if(!$users)return;

            $last=$db->table('visita_status_historico')->select('id')
                ->where('visita_id',$visitaId)->orderBy('id','DESC')->get()->getRowArray();
            // Mudanças de participantes geram evento próprio mesmo sem status novo.
            $broker=$db->table('visita_corretor_historico')->select('id')
                ->where('visita_id',$visitaId)->orderBy('id','DESC')->get()->getRowArray();
            $source=$evento==='CORRETORES'?'B'.(int)($broker['id']??0):'S'.(int)($last['id']??0);
            $key='VISITA:'.$visitaId.':'.$evento.':'.$source;
            $labels=[
                'CHEGADA'=>'Nova visita registrada','INICIADO'=>'Atendimento iniciado',
                'RETOMADA'=>'Atendimento retomado','CORRETORES'=>'Corretores atualizados',
                'VENDA'=>'Visita concluída com venda','PENDENCIA'=>'Visita concluída com pendência',
                'RETORNO'=>'Retorno agendado','SEM_VENDA'=>'Visita sem venda',
            ];
            $title=($labels[$evento]??'Visita atualizada').' · #'.$visitaId;
            $message=match($evento){
                'SEM_VENDA'=>self::motivo($db,$v),
                'RETORNO'=>'Retorno previsto para '.(string)($v['retorno_previsto']??'data não informada').'.',
                'VENDA'=>'Atendimento fechado com venda. Confira o lançamento do título.',
                'PENDENCIA'=>'Atendimento encerrado com negociação pendente.',
                'CORRETORES'=>'Houve mudança dos corretores vinculados ao atendimento.',
                'INICIADO'=>'O atendimento foi iniciado.',
                'RETOMADA'=>'O atendimento foi retomado.',
                default=>'Um novo atendimento foi registrado.',
            };
            // Somente status operacional e motivo comercial; nunca nome, telefone ou CPF.
            foreach($users as $uid){
                AvisosSplash::alertaUsuario($uid,$key,'VISITA',$title,$message,'atendimentos');
            }
            EnvioPushSplash::enviar(10);
        }catch(Throwable $e){
            log_message('error','Falha ao registrar aviso de visita: {error}',['error'=>$e->getMessage()]);
        }
    }

    private static function motivo($db,array $visit):string
    {
        $id=(int)($visit['motivo_nao_venda_id']??0);
        if(!$id)return 'Atendimento encerrado sem venda.';
        $row=$db->table('motivos_nao_venda')->select('descricao')->where('id',$id)->get()->getRowArray();
        $reason=mb_substr(trim((string)($row['descricao']??'')),0,120);
        return $reason!==''?'Não houve venda. Motivo: '.$reason.'.':'Atendimento encerrado sem venda.';
    }
}
