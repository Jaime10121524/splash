<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Livro de custódia do responsável pelo fechamento, em centavos.
 * Nunca é um extrato de comissões pessoais e não movimenta dinheiro.
 */
final class ConciliacaoCaixa
{
    public const TIPOS = ['SALDO_ANTERIOR', 'PIX_RETIDO', 'REPASSE_CLUBE'];

    public static function calcular(int $recebidoClube, int $pagamentos, array $movimentos): array
    {
        $anterior=0;
        $pix=0;
        $devolvido=0;
        foreach($movimentos as $movimento){
            if(($movimento['situacao']??'')!=='ATIVO')continue;
            $valor=VendaMoney::cents((string)$movimento['valor']);
            if($valor===null)throw new \InvalidArgumentException('Movimento de custódia inválido.');
            switch($movimento['tipo']){
                case 'SALDO_ANTERIOR': $anterior+=$valor;break;
                case 'PIX_RETIDO': $pix+=$valor;break;
                case 'REPASSE_CLUBE': $devolvido+=$valor;break;
                default: throw new \InvalidArgumentException('Tipo de movimento de custódia inválido.');
            }
        }
        $saldo=$recebidoClube+$anterior+$pix-$pagamentos-$devolvido;
        return [
            'recebido_clube'=>VendaMoney::decimal($recebidoClube),
            'saldo_anterior_informado'=>VendaMoney::decimal($anterior),
            'pix_retido_informado'=>VendaMoney::decimal($pix),
            'pagamentos_confirmados'=>VendaMoney::decimal($pagamentos),
            'devolvido_clube'=>VendaMoney::decimal($devolvido),
            'saldo_conciliado'=>VendaMoney::decimal($saldo),
            'diferença_a_esclarecer'=>$saldo<0,
        ];
    }
}
