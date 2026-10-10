<?php

declare(strict_types=1);

namespace App\Libraries;

use InvalidArgumentException;

/** Totais em centavos. Não converte comissão prevista em dinheiro recebido. */
final class SaldoComissao
{
    public static function titular(int $comissao,int $participacoesPagasPeloTitular): int
    {
        if($comissao<0 || $participacoesPagasPeloTitular<0 || $participacoesPagasPeloTitular>$comissao){
            throw new InvalidArgumentException('Distribuição maior do que a comissão disponível.');
        }
        return $comissao-$participacoesPagasPeloTitular;
    }

    public static function pago(array $movimentos): int
    {
        $result=0;
        foreach($movimentos as $movimento){
            $value=VendaMoney::cents((string)$movimento['valor'],true);
            if($value===null)throw new InvalidArgumentException('Valor de pagamento inválido.');
            if(!in_array($movimento['tipo'],['PAGAMENTO','ESTORNO'],true)){
                throw new InvalidArgumentException('Tipo de movimento desconhecido.');
            }
            $result+=($movimento['tipo']==='PAGAMENTO'?1:-1)*$value;
        }
        if($result<0)throw new InvalidArgumentException('Estornos superiores aos pagamentos.');
        return $result;
    }

    public static function resumo(int $total,int $pago): array
    {
        if($total<0||$pago<0||$pago>$total){
            throw new InvalidArgumentException('Pagamento ultrapassa o total devido.');
        }
        return ['total'=>VendaMoney::decimal($total),
            'pago'=>VendaMoney::decimal($pago),
            'pendente'=>VendaMoney::decimal($total-$pago)];
    }
}
