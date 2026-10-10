<?php
declare(strict_types=1);

namespace App\Libraries;

use InvalidArgumentException;

/**
 * Identifica quanto continua válido em um Pix de cliente.
 * ESTORNO e DEVOLUCAO reduzem a origem, nunca geram um novo recebimento.
 */
final class PixConferencia
{
    public static function saldo(string $original,array $movimentos): int
    {
        $base=VendaMoney::cents($original,true);
        if($base===null)throw new InvalidArgumentException('Recebimento original inválido.');
        $revertido=0;
        foreach($movimentos as $m){
            if(!in_array((string)($m['tipo']??''),['ESTORNO','DEVOLUCAO'],true))continue;
            $centavos=VendaMoney::cents((string)($m['valor']??''),true);
            if($centavos===null)throw new InvalidArgumentException('Devolução ou estorno inválido.');
            $revertido+=$centavos;
        }
        return max(0,$base-$revertido);
    }

    public static function mesmoValor(int $pixDisponivel,int $jaRegistrado): bool
    {
        return $pixDisponivel>0 && $pixDisponivel===$jaRegistrado;
    }
}
