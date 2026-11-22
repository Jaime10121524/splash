<?php

declare(strict_types=1);

namespace App\Libraries;

/**
 * Escopo comercial separado de propriedade da corrente e de rateios.
 *
 * - Proprietario da corrente: direito comercial do cliente.
 * - Equipe: permissao operacional sobre visitas, agenda e negociacoes.
 * - Comissoes: direitos financeiros independentes de visibilidade.
 *
 * Nenhum ID de equipe enviado pelo aplicativo concede acesso.
 */
final class GestaoEquipe
{
    public static function pessoaId($db, $user): ?int
    {
        $p=$db->table('pessoas')->select('id')
            ->where('user_id',(int)$user->id)->where('ativo',1)->get()->getRowArray();
        return $p?(int)$p['id']:null;
    }

    /** Gerencia pode ser atribuida a Pessoa mesmo que o login tenha grupo corretor. */
    public static function ehGestor($db,$user): bool
    {
        if($user->inGroup('gerente'))return true;
        $own=self::pessoaId($db,$user);
        return $own!==null && $db->table('pessoa_papeis')
            ->where('pessoa_id',$own)->where('papel','gerente')->countAllResults()>0;
    }

    /** IDs de todas as pessoas sob gestao, inclusive niveis subordinados. */
    public static function ids($db, $user): array
    {
        $own=self::pessoaId($db,$user);
        if($own===null)return [];
        $ids=[$own];
        if(!self::ehGestor($db,$user))return $ids;
        $frontier=[$own];
        // Evita ciclos de configuracao. Limite restritivo de profundidade.
        for($level=0;$level<30 && $frontier;$level++){
            $next=[];
            foreach($db->table('gestor_corretores')->select('corretor_pessoa_id')
                ->whereIn('gestor_pessoa_id',$frontier)->get()->getResultArray() as $link){
                $child=(int)$link['corretor_pessoa_id'];
                if($child>0&&!in_array($child,$ids,true)){
                    $ids[]=$child;$next[]=$child;
                }
            }
            $frontier=$next;
        }
        return $ids;
    }

    /** Criadores que integram a equipe, independentemente de quem e titular. */
    public static function usuarios($db, $user): array
    {
        $ids=self::ids($db,$user);
        if(!$ids)return [(int)$user->id];
        $uids=[(int)$user->id];
        foreach($db->table('pessoas')->select('user_id')->whereIn('id',$ids)
            ->where('ativo',1)->where('user_id IS NOT NULL',null,false)
            ->get()->getResultArray() as $p){
            $uids[]=(int)$p['user_id'];
        }
        return array_values(array_unique($uids));
    }

    /** Filtra dados de cliente sem trocar a titularidade da corrente. */
    public static function filtrarClientes($db,$user,$query): void
    {
        if($user->inGroup('admin','operador'))return;
        $ids=self::ids($db,$user);
        $users=self::usuarios($db,$user);
        if(!$ids){$query->where('1=0',null,false);return;}
        $people=implode(',',array_map('intval',$ids));
        $creators=implode(',',array_map('intval',$users));
        $query->groupStart()
            ->whereIn('c.dono_corrente_pessoa_id',$ids)
            ->orWhere("EXISTS (SELECT 1 FROM visitas v WHERE v.cliente_id=c.id AND (v.corretor_pessoa_id IN ($people) OR v.segundo_corretor_pessoa_id IN ($people) OR v.criado_por_usuario_id IN ($creators)))",null,false)
            ->orWhere("EXISTS (SELECT 1 FROM venda_operacoes o WHERE o.cliente_id=c.id AND (o.corretor_pessoa_id IN ($people) OR o.segundo_corretor_pessoa_id IN ($people) OR o.gerente_pessoa_id IN ($people) OR o.criado_por_usuario_id IN ($creators)))",null,false)
            ->orWhere("EXISTS (SELECT 1 FROM agendamentos ag WHERE ag.cliente_id=c.id AND (ag.captador_pessoa_id IN ($people) OR ag.corretor_confirmado_pessoa_id IN ($people) OR ag.segundo_corretor_pessoa_id IN ($people) OR ag.criado_por_usuario_id IN ($creators)))",null,false)
            ->groupEnd();
    }

    public static function podeVerCliente($db,$user,int $clienteId): bool
    {
        if($clienteId<1)return false;
        $q=$db->table('clientes c')->select('c.id')->where('c.id',$clienteId)->where('c.ativo',1);
        self::filtrarClientes($db,$user,$q);
        return $q->countAllResults()>0;
    }

    public static function podeGerirOperacao($db,$user,array $op): bool
    {
        if($user->inGroup('admin'))return true;
        $ids=self::ids($db,$user);
        if(!$ids)return false;
        $users=self::usuarios($db,$user);
        if(in_array((int)($op['corretor_pessoa_id']??0),$ids,true)
            || in_array((int)($op['segundo_corretor_pessoa_id']??0),$ids,true)
            || in_array((int)($op['gerente_pessoa_id']??0),$ids,true)
            || in_array((int)($op['criado_por_usuario_id']??0),$users,true))return true;
        $visitId=(int)($op['visita_id']??0);
        if($visitId<1)return false;
        $v=$db->table('visitas')->select('corretor_pessoa_id,segundo_corretor_pessoa_id,criado_por_usuario_id')
            ->where('id',$visitId)->get()->getRowArray();
        return $v && (in_array((int)$v['corretor_pessoa_id'],$ids,true)
            || in_array((int)($v['segundo_corretor_pessoa_id']??0),$ids,true)
            || in_array((int)$v['criado_por_usuario_id'],$users,true));
    }

    /** Titular configuravel por corretor; sem configuracao, o proprio captador. */
    public static function donoPadrao($db,int $corretor): int
    {
        $p=$db->table('pessoas')->select('id,dono_corrente_padrao_pessoa_id')
            ->where('id',$corretor)->where('ativo',1)->get()->getRowArray();
        return $p ? (int)($p['dono_corrente_padrao_pessoa_id']?:$p['id']) : $corretor;
    }

    /**
     * Renovacao externa depende de origem RENOVACAO e de corretor principal
     * pertencente a outra corrente padrao, nao de um checkbox no aplicativo.
     */
    public static function renovacaoExterna($db,int $cliente,int $titular,?array $visita=null): bool
    {
        $r=$db->table('clientes c')->select('o.nome AS origem_nome,c.dono_corrente_pessoa_id')
            ->join('lead_origens o','o.id=c.origem_id','left')
            ->where('c.id',$cliente)->get()->getRowArray();
        if(!$r||mb_stripos((string)($r['origem_nome']??''),'renova')===false)return false;
        $origin=(int)($visita['corretor_pessoa_id']??0);
        if($visita && (int)($visita['criado_por_usuario_id']??0)>0){
            $u=$db->table('pessoas')->select('id')
                ->where('user_id',(int)$visita['criado_por_usuario_id'])->where('ativo',1)
                ->get()->getRowArray();
            if($u)$origin=(int)$u['id'];
        }
        if($origin<1)$origin=(int)$r['dono_corrente_pessoa_id'];
        $owner=self::donoPadrao($db,$origin);
        return self::donoPadrao($db,$titular)!==$owner;
    }

    /** Troca de corrente auditable, sem alterar equipe, rateios ou captacao. */
    public static function atribuirCorrente($db,int $cliente,int $dono,int $usuario,string $motivo): void
    {
        $old=$db->table('clientes')->select('dono_corrente_pessoa_id')->where('id',$cliente)
            ->get()->getRowArray();
        if(!$old)throw new \RuntimeException('Cliente nao encontrado na transferencia de corrente.');
        $before=(int)$old['dono_corrente_pessoa_id'];
        if($before===$dono)return;
        $now=date('Y-m-d H:i:s');
        $db->table('clientes')->where('id',$cliente)->update([
            'dono_corrente_pessoa_id'=>$dono,'atualizado_em'=>$now,
        ]);
        $db->table('cliente_corrente_historico')->insert([
            'cliente_id'=>$cliente,'dono_anterior_pessoa_id'=>$before,
            'dono_novo_pessoa_id'=>$dono,'origem'=>'AJUSTE_MANUAL',
            'justificativa'=>$motivo,'usuario_id'=>$usuario,'criado_em'=>$now,
        ]);
    }
}
