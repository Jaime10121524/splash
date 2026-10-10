<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Valores recebidos do clube e valores pagos a beneficiários são eventos
 * distintos. A conferência mede somente o que falta vincular a ENTRADAS DO
 * CLUBE, não uma dívida exigível do clube nem saldo de comissão pessoal.
 */
final class FechamentoConferencia
{
    public static function diferencaSemEntradaDoClube(int $comissaoBruta,int $entradasClube): int
    {
        return $comissaoBruta-$entradasClube;
    }
}
