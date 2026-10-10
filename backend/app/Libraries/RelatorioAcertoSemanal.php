<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Demonstrativo de direitos de cada pessoa após o fechamento.
 * Recebimento do clube NÃO é baixa de comissão; apenas pagamentos e
 * abatimentos efetivamente registrados nos movimentos reduzem o pendente.
 *
 * Entrada pura, sem banco, para testar o cálculo inclusive em centavos.
 */
final class RelatorioAcertoSemanal
{
    public static function calcular(
        array $sales, array $rateios, array $movTitular,
        array $movRateio, int $formaAbatimentoId
    ): array {
        $movOwner=[];$movPart=[];
        foreach ($movTitular as $mov) {
            $id=(int)$mov['operacao_id'];
            $cent=VendaMoney::cents((string)$mov['valor'],true);
            $sign=$mov['tipo']==='PAGAMENTO'?1:-1;
            $movOwner[$id]['pago']=($movOwner[$id]['pago']??0)+$sign*$cent;
            if ($formaAbatimentoId>0 && (int)($mov['forma_id']??0)===$formaAbatimentoId) {
                $movOwner[$id]['abatido']=($movOwner[$id]['abatido']??0)+$sign*$cent;
            }
        }
        foreach ($movRateio as $mov) {
            $id=(int)$mov['rateio_id'];
            $cent=VendaMoney::cents((string)$mov['valor'],true);
            $sign=$mov['tipo']==='PAGAMENTO'?1:-1;
            $movPart[$id]['pago']=($movPart[$id]['pago']??0)+$sign*$cent;
            if ($formaAbatimentoId>0 && (int)($mov['forma_id']??0)===$formaAbatimentoId) {
                $movPart[$id]['abatido']=($movPart[$id]['abatido']??0)+$sign*$cent;
            }
        }

        $rateBySale=[];
        foreach ($rateios as $r) {
            $rateBySale[(int)$r['operacao_id']][]=$r;
        }

        $people=[];$operations=[];$grossSum=0;
        $add=static function (int $personId,string $name,array $line)use(&$people): void {
            $people[$personId]??=[
                'pessoa_id'=>$personId,'nome'=>$name,
                'direitos_cent'=>0,'pago_cent'=>0,'abatido_cent'=>0,'itens'=>[],
            ];
            $people[$personId]['direitos_cent']+=$line['total_cent'];
            $people[$personId]['pago_cent']+=$line['pago_cent'];
            $people[$personId]['abatido_cent']+=$line['abatido_cent'];
            $people[$personId]['itens'][]=$line;
        };
        foreach ($sales as $sale) {
            $id=(int)$sale['id'];
            $root=(int)$sale['corretor_pessoa_id'];
            $base=$sale['comissao_ajustada']??$sale['comissao_prevista'];
            $gross=$base===null?0:VendaMoney::cents((string)$base,true);
            $grossSum+=$gross;
            $all=$rateBySale[$id]??[];
            $outgoingRoot=0;
            $links=[];
            foreach ($all as $a) {
                $from=(int)$a['responsavel_pessoa_id'];
                $to=(int)$a['beneficiario_pessoa_id'];
                $value=VendaMoney::cents((string)$a['valor'],true);
                if ($from===$root)$outgoingRoot+=$value;
                $p=$movPart[(int)$a['id']]['pago']??0;
                $off=$movPart[(int)$a['id']]['abatido']??0;
                $links[]=[
                    'pessoa_id'=>$to,'nome'=>(string)$a['beneficiario_nome'],
                    'origem_pessoa_id'=>$from,
                    'papel'=>(string)$a['papel'],
                    'total_cent'=>$value,'pago_cent'=>$p,'abatido_cent'=>$off,
                    'rateio_id'=>(int)$a['id'],
                ];
            }
            $titulo=trim((string)($sale['numero_titulo']??'').' '.(string)($sale['sigla_plano']??''));
            $ownerTotal=$gross-$outgoingRoot;
            $ownerPaid=$movOwner[$id]['pago']??0;
            $ownerOffset=$movOwner[$id]['abatido']??0;
            $ownerLine=[
                'operacao_id'=>$id,'data'=>$sale['data_venda'],
                'titulo'=>$titulo,'papel'=>'TITULAR',
                'total_cent'=>$ownerTotal,'pago_cent'=>$ownerPaid,
                'abatido_cent'=>$ownerOffset,
            ];
            $add($root,(string)$sale['titular_nome'],$ownerLine);
            foreach ($links as $line) {
                $add($line['pessoa_id'],$line['nome'],[
                    'operacao_id'=>$id,'data'=>$sale['data_venda'],
                    'titulo'=>$titulo,'papel'=>$line['papel'],
                    'total_cent'=>$line['total_cent'],
                    'pago_cent'=>$line['pago_cent'],
                    'abatido_cent'=>$line['abatido_cent'],
                ]);
            }

            $operations[]=[
                'operacao_id'=>$id,'titulo'=>$titulo,
                'data'=>$sale['data_venda'],'titular_pessoa_id'=>$root,
                'titular_nome'=>(string)$sale['titular_nome'],
                'cliente_nome'=>(string)($sale['cliente_nome']??''),
                'bruta'=>VendaMoney::decimal($gross),
                'parte_propria'=>VendaMoney::decimal($ownerTotal),
                'participacoes'=>array_map(static fn($r)=>[
                    'pessoa_id'=>$r['pessoa_id'],'nome'=>$r['nome'],
                    'origem_pessoa_id'=>$r['origem_pessoa_id'],
                    'papel'=>$r['papel'],
                    'valor'=>VendaMoney::decimal($r['total_cent']),
                    'pago'=>VendaMoney::decimal($r['pago_cent']),
                    'pendente'=>VendaMoney::decimal(max(0,$r['total_cent']-$r['pago_cent'])),
                ],$links),
            ];
        }

        foreach ($people as &$p) {
            $due=$p['direitos_cent'];$paid=$p['pago_cent'];$offset=$p['abatido_cent'];
            $p['resumo']=[
                'total'=>VendaMoney::decimal($due),
                'liquidado'=>VendaMoney::decimal($paid),
                'recebido'=>VendaMoney::decimal($paid-$offset),
                'abatido'=>VendaMoney::decimal($offset),
                'pendente'=>VendaMoney::decimal(max(0,$due-$paid)),
            ];
            foreach ($p['itens'] as &$line) {
                $total=$line['total_cent'];$paidLine=$line['pago_cent'];$off=$line['abatido_cent'];
                $line['valor']=VendaMoney::decimal($total);
                $line['liquidado']=VendaMoney::decimal($paidLine);
                $line['recebido']=VendaMoney::decimal($paidLine-$off);
                $line['abatido']=VendaMoney::decimal($off);
                $line['pendente']=VendaMoney::decimal(max(0,$total-$paidLine));
                unset($line['total_cent'],$line['pago_cent'],$line['abatido_cent']);
            }
            unset($line);
            unset($p['direitos_cent'],$p['pago_cent'],$p['abatido_cent']);
            usort($p['itens'],static fn($x,$y)=>strcmp($x['data'],$y['data']));
        }
        unset($p);
        usort($operations,static fn($x,$y)=>strcmp($x['data'],$y['data']));
        return [
            'bruta'=>VendaMoney::decimal($grossSum),
            'pessoas'=>array_values($people),'vendas'=>$operations,
        ];
    }

    /** Não deixa chegar ao JSON do participante informação financeira de terceiros. */
    public static function individual(array $full,int $personId): array
    {
        $person=null;
        foreach ($full['pessoas'] as $p) {
            if ((int)$p['pessoa_id']===$personId) {$person=$p;break;}
        }
        if ($person===null) {
            return ['pessoas'=>[],'vendas'=>[]];
        }
        // Só a própria linha financeira: nome de cliente, comissões brutas de
        // outro corretor, rateios de outras pessoas e caixa do clube nunca saem.
        return ['pessoas'=>[$person],'vendas'=>[]];
    }
}
