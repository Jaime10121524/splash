<?php

declare(strict_types=1);

namespace App\Libraries;

/** Grava a bonificação na mesma transação do cadastro; sem saldo artificial. */
final class BonificacaoIndicacao
{
    public static function registrar($db,int $clienteId,array $clean,array $request,$user): array
    {
        $flag=$request['bonificacao_registrar']??false;
        if ($flag===false || $flag===null) return [];
        if ($flag!==true) return ['error'=>'Informe corretamente se deseja registrar bonificação.'];
        $indicator=$clean['indicador_cliente_id']??null;
        if (!$indicator || (int)$indicator===$clienteId) {
            return ['error'=>'Para registrar bonificação, informe quem indicou o cliente.'];
        }
        $cents=VendaMoney::cents($request['bonificacao_valor']??null);
        if ($cents===null || $cents>100000000) {
            return ['error'=>'Informe valor de bonificação maior que zero e até R$ 1.000.000,00.'];
        }
        $paid=$request['bonificacao_paga']??false;
        if (!is_bool($paid)) return ['error'=>'Situação de pagamento inválida.'];
        if ($paid && !$user->inGroup('admin')) {
            return ['error'=>'Somente a administração pode confirmar pagamento no financeiro.'];
        }
        if ($db->table('indicacao_bonificacoes')->where('cliente_indicado_id',$clienteId)->countAllResults()) {
            return ['error'=>'Este cliente já possui bonificação de indicação registrada.'];
        }
        $now=date('Y-m-d H:i:s');
        $db->table('indicacao_bonificacoes')->insert([
            'cliente_indicado_id'=>$clienteId,
            'indicador_cliente_id'=>(int)$indicator,
            'pessoa_financeira_id'=>(int)$clean['dono_corrente_pessoa_id'],
            'valor'=>VendaMoney::decimal($cents),
            'situacao'=>'PENDENTE',
            'criado_por_usuario_id'=>(int)$user->id,
            'criado_em'=>$now,
        ]);
        $bonusId=(int)$db->insertID();
        if ($bonusId<1) throw new \RuntimeException('Falha ao registrar bonificação.');
        if ($paid) {
            $error=self::pagar($db,$bonusId,$user);
            if ($error!==null) return ['error'=>$error];
        }
        return ['bonificacao_id'=>$bonusId,'situacao'=>$paid?'PAGA':'PENDENTE'];
    }

    public static function pagar($db,int $id,$user): ?string
    {
        if (!$user->inGroup('admin')) return 'Somente o administrador pode confirmar o pagamento.';
        $bonus=$db->query('SELECT * FROM indicacao_bonificacoes WHERE id=? FOR UPDATE',[$id])->getRowArray();
        if (!$bonus) return 'Bonificação não encontrada.';
        if ($bonus['situacao']!=='PENDENTE' || $bonus['financeiro_despesa_id']!==null) {
            return 'Esta bonificação já foi processada.';
        }
        $category=$db->table('financeiro_categorias_despesa')
            ->where('nome','Bonificações')->where('ativo',1)->where('pessoa_id',null)
            ->get()->getRowArray();
        if (!$category) return 'Cadastre uma categoria global ativa chamada Bonificações.';
        $client=$db->table('clientes')->where('id',(int)$bonus['indicador_cliente_id'])->get()->getRowArray();
        if (!$client) return 'Cliente indicador não localizado.';

        // A despesa é da conta do titular da corrente. O favorecido real fica
        // registrado no histórico da bonificação (cliente indicador).
        $db->table('financeiro_despesas')->insert([
            'pessoa_id'=>(int)$bonus['pessoa_financeira_id'],
            'categoria_id'=>(int)$category['id'],
            'data_despesa'=>date('Y-m-d'),
            'valor'=>$bonus['valor'],
            'descricao'=>'Bonificação paga a indicador: '.$client['nome']
                .' (cliente indicado nº '.$bonus['cliente_indicado_id'].')',
            'situacao'=>'ATIVA','criado_por_usuario_id'=>(int)$user->id,
            'criado_em'=>date('Y-m-d H:i:s'),
        ]);
        $expenseId=(int)$db->insertID();
        if ($expenseId<1) throw new \RuntimeException('Falha na despesa de bonificação.');
        $db->table('indicacao_bonificacoes')->where('id',$id)->update([
            'situacao'=>'PAGA','data_pagamento'=>date('Y-m-d'),
            'financeiro_despesa_id'=>$expenseId,
            'confirmado_por_usuario_id'=>(int)$user->id,
        ]);
        return null;
    }
}
