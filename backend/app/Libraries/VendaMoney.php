<?php

declare(strict_types=1);

namespace App\Libraries;

final class VendaMoney
{
    /**
     * Reais para centavos, sem float, evitando diferenças na divisão por 3.
     * API aceita apenas formato decimal 1000.00; UI converte 1.000,00.
     */
    public static function cents(mixed $value, bool $zeroAllowed=false): ?int
    {
        if (!is_string($value) && !is_int($value)) return null;
        $txt=(string)$value;
        if (!preg_match('/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/D',$txt)) return null;
        [$whole,$fraction]=array_pad(explode('.',$txt,2),2,'');
        $n=((int)$whole)*100+(int)str_pad($fraction,2,'0');
        if ($n<0 || (!$zeroAllowed && $n===0) || $n>999999999999) return null;
        return $n;
    }

    public static function decimal(int $cents): string
    {
        return ($cents<0?'-':'').intdiv(abs($cents),100).'.'.str_pad((string)(abs($cents)%100),2,'0',STR_PAD_LEFT);
    }

    public static function roundDiv(int $value,int $divisor): int
    {
        if($divisor<1)throw new \InvalidArgumentException('Divisor inválido.');
        return intdiv($value+intdiv($divisor,2),$divisor);
    }

    /**
     * A comissão prevista é sempre BRUTA antes das divisões entre pessoas.
     * CARTAO: 1/3 menos 8% da comissão.
     * MISTO (confirmação do usuário): 1/3 do plano; PIX cobre a primeira
     * parcela da comissão; só o saldo da comissão recebe desconto de 8%.
     *
     * Se PIX superar a base, a regra combinada não é inequívoca: sem estimativa
     * até ajuste manual registrado no futuro fechamento.
     */
    public static function estimate(array $rule, int $gross, int $cashPix, int $discount): array
    {
        $num=(int)($rule['numerador']??0);
        $den=(int)($rule['denominador']??0);
        $rate=(string)($rule['desconto_cartao']??'0');
        $mode=(string)($rule['modalidade']??'');
        if($num<1 || $den<1 || $num>$den || !in_array($mode,['AVISTA','CARTAO','MISTO'],true)) {
            throw new \InvalidArgumentException('Modelo de comissão inválido.');
        }
        if(!preg_match('/^\d{1,3}(?:\.\d{1,3})?$/D',$rate)) {
            throw new \InvalidArgumentException('Desconto da comissão inválido.');
        }
        [$whole,$fraction]=array_pad(explode('.',$rate,2),2,'');
        $basis=(int)$whole*1000+(int)str_pad($fraction,3,'0');
        if($basis>100000)throw new \InvalidArgumentException('Desconto não pode ultrapassar 100%.');
        $base=self::roundDiv($gross*$num,$den);
        if($discount>$base) {
            return ['valor'=>null,'aviso'=>'Desconto concedido excede a comissão base; requer negociação e conferência.'];
        }
        if($mode==='MISTO') {
            if($cashPix>$base) return [
                'valor'=>null,
                'aviso'=>'O PIX recebido ultrapassa a comissão base. A comissão mista requer ajuste manual antes do fechamento.',
            ];
            $remaining=$base-$cashPix;
            $after=self::roundDiv($remaining*(100000-$basis),100000);
            if($discount>$cashPix+$after) {
                return ['valor'=>null,'aviso'=>'O desconto excede a comissão líquida; revise o acordo.'];
            }
            return ['valor'=>self::decimal($cashPix+$after-$discount),'aviso'=>'Estimativa mista; conferir repasses no fechamento.'];
        }
        $commission=$mode==='CARTAO'
            ?self::roundDiv($base*(100000-$basis),100000)
            :$base;
        if($discount>$commission) {
            return ['valor'=>null,'aviso'=>'O desconto excede a comissão líquida; revise o acordo.'];
        }
        return ['valor'=>self::decimal($commission-$discount),'aviso'=>null];
    }
}
