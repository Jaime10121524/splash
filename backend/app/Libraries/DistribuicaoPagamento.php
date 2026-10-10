<?php

declare(strict_types=1);

namespace App\Libraries;

/**
 * Parcelas por conta (venda/atendimento) e forma, sem float.
 * FIFO: venda mais antiga, operação menor, depois tipo/rateio.
 * Não altera banco de dados: o controller revalida os saldos em transação.
 */
final class DistribuicaoPagamento
{
    public static function calcular(array $linhas,array $formas): array
    {
        $saldos=[];
        foreach($linhas as $l){
            $saldo=(int)($l['pendente_centavos']??-1);
            if($saldo<0)throw new \InvalidArgumentException('Saldo inválido.');
            if($saldo>0)$saldos[]=$l;
        }
        usort($saldos,static function($a,$b){
            return strcmp((string)$a['data_venda'],(string)$b['data_venda'])
                ?:((int)$a['operacao_id']<=>(int)$b['operacao_id'])
                ?:strcmp((string)$a['tipo'],(string)$b['tipo'])
                ?:((int)($a['rateio_id']??0)<=>(int)($b['rateio_id']??0));
        });
        $available=array_sum(array_column($saldos,'pendente_centavos'));
        $total=0;
        $parts=[];
        foreach($formas as $f){
            $amount=(int)($f['valor_centavos']??0);
            $id=(int)($f['forma_id']??0);
            if($id<=0||$amount<=0)throw new \InvalidArgumentException('Meio de pagamento ou valor inválido.');
            $total+=$amount;
            foreach($saldos as &$l){
                if($amount===0)break;
                $take=min($amount,(int)$l['pendente_centavos']);
                if($take<=0)continue;
                $parts[]=[
                    'operacao_id'=>(int)$l['operacao_id'],
                    'rateio_id'=>isset($l['rateio_id'])?(int)$l['rateio_id']:null,
                    'tipo'=>$l['tipo'],'forma_id'=>$id,'valor_centavos'=>$take,
                ];
                $amount-=$take;
                $l['pendente_centavos']-=$take;
            }
            unset($l);
            if($amount>0)throw new \InvalidArgumentException('Valor do acerto supera o saldo da pessoa.');
        }
        if($total<1 || $total>$available)throw new \InvalidArgumentException('Acerto fora do saldo pendente.');
        return $parts;
    }
}
