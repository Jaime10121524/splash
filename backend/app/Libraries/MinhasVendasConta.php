<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Apuração individual para consulta de vendas de vendedor/corretor/gerente.
 * Não recebe, nem devolve, nomes ou dados pessoais de clientes e terceiros.
 */
final class MinhasVendasConta
{
    public static function minhaParticipacao(array $sale, int $pessoaId, array $rateios, array $movTitular, array $movRateios, ?string $apuracao, bool $clienteQuitou, int $formaAbatimentoId, bool $fechamentoEmAndamento = false): array
    {
        $operacaoId=(int)$sale['id'];
        $titularId=(int)$sale['corretor_pessoa_id'];
        $papeis=[];
        $direitos=0;
        $liquidado=0;
        $abatido=0;
        $eventos=[];
        $base=$sale['comissao_ajustada']??$sale['comissao_prevista'];
        $distribuido=$apuracao!==null && $apuracao!=='REVISAR' || count($rateios)>0;
        $confirmado=$clienteQuitou && $base!==null && $distribuido;
        $isOwner=$titularId===$pessoaId;

        $creditoMov=static function(array $moves,string $papel)use(&$eventos,$formaAbatimentoId): array {
            $paid=0;$offset=0;
            foreach($moves as $mov){
                $value=VendaMoney::cents((string)$mov['valor'],true);
                $signed=($mov['tipo']==='PAGAMENTO'?1:-1)*$value;
                $paid+=$signed;
                $isAbatimento=$formaAbatimentoId>0 && (int)$mov['forma_id']===$formaAbatimentoId;
                if($isAbatimento)$offset+=$signed;
                $eventos[]=[
                    'id'=>(int)$mov['id'],
                    'data'=>$mov['data_pagamento'],
                    'papel'=>$papel,
                    'tipo'=>$mov['tipo'],
                    'forma'=>$isAbatimento?'ABATIMENTO':'PAGAMENTO',
                    'valor'=>VendaMoney::decimal($value),
                    'efeito'=>VendaMoney::decimal($signed),
                ];
            }
            return [$paid,$offset];
        };

        if($isOwner){
            $papeis[]='TITULAR';
            if($confirmado){
                $owner=VendaMoney::cents((string)$base,true);
                foreach($rateios as $r){
                    if((int)$r['responsavel_pessoa_id']===$titularId){
                        $owner-=VendaMoney::cents((string)$r['valor'],true);
                    }
                }
                $direitos+=$owner;
            }
            [$paid,$offset]=$creditoMov($movTitular,'TITULAR');
            $liquidado+=$paid;$abatido+=$offset;
        }

        foreach($rateios as $r){
            if((int)$r['beneficiario_pessoa_id']!==$pessoaId)continue;
            $papel=(string)$r['papel'];
            if(!in_array($papel,$papeis,true))$papeis[]=$papel;
            if($confirmado)$direitos+=VendaMoney::cents((string)$r['valor'],true);
            [$paid,$offset]=$creditoMov($movRateios[(int)$r['id']]??[],$papel);
            $liquidado+=$paid;$abatido+=$offset;
        }

        // Associação a atendimento e corretagem também aparece mesmo quando a
        // apuração ainda está pendente ou existe regra sem comissão aplicável.
        foreach([
            'segundo_corretor_pessoa_id'=>'CORRETOR',
            'atendente_pessoa_id'=>'ATENDENTE',
            'atendente_adicional_pessoa_id'=>'ATENDENTE',
            'gerente_pessoa_id'=>'GERENTE',
        ] as $field=>$papel){
            if((int)($sale[$field]??0)===$pessoaId && !in_array($papel,$papeis,true)){
                $papeis[]=$papel;
            }
        }
        if(!$papeis)$papeis=['PARTICIPACAO'];

        usort($eventos,static fn($a,$b)=>strcmp($b['data'],$a['data']) ?: $b['id']<=>$a['id']);

        // Um fechamento ainda aberto não representa confirmação dos pagamentos.
        // Nenhum movimento nem status de fechamento é exposto antes da conclusão.
        if($fechamentoEmAndamento){
            return [
                'situacao'=>'EM_APURACAO','papeis'=>$papeis,'direito'=>null,
                'liquidado'=>null,'recebido'=>null,'abatido'=>null,'pendente'=>null,
                'movimentos'=>[],
            ];
        }
        if(!$confirmado){
            return [
                'situacao'=>'A_APURAR','papeis'=>$papeis,'direito'=>null,
                'liquidado'=>VendaMoney::decimal($liquidado),
                'recebido'=>VendaMoney::decimal($liquidado-$abatido),
                'abatido'=>VendaMoney::decimal($abatido),'pendente'=>null,
                'movimentos'=>$eventos,
            ];
        }
        $status=$direitos<=0?'SEM_COMISSAO'
            :($liquidado<=0?'A_RECEBER':($liquidado<$direitos?'PARCIAL':'QUITADA'));
        return [
            'situacao'=>$status,'papeis'=>$papeis,
            'direito'=>VendaMoney::decimal($direitos),
            'liquidado'=>VendaMoney::decimal($liquidado),
            'recebido'=>VendaMoney::decimal($liquidado-$abatido),
            'abatido'=>VendaMoney::decimal($abatido),
            'pendente'=>VendaMoney::decimal(max(0,$direitos-$liquidado)),
            'movimentos'=>$eventos,
        ];
    }

    /** Resposta com campos explicitamente autorizados; nunca espalhar a linha SQL. */
    public static function publico(array $sale,array $conta,bool $quitada,?int $fechamentoConcluidoId): array
    {
        return [
            'id'=>(int)$sale['id'],
            'titulo'=>trim((string)($sale['numero_titulo']??'').' '.(string)($sale['sigla_plano']??'')),
            'data_venda'=>$sale['data_venda'],
            'data_vencimento'=>$sale['data_vencimento'],
            'cliente_quitou'=>$quitada,
            'fechamento_concluido_id'=>$fechamentoConcluidoId,
            'comissao'=>$conta,
        ];
    }
}
