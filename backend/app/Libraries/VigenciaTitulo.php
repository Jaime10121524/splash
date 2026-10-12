<?php
namespace App\Libraries;

final class VigenciaTitulo
{
    public static function renovar(string $anterior,string $data,int $meses): array
    {
        $base=max($anterior,$data);
        return ['inicio'=>$base,'vencimento'=>self::vencimento($base,$meses)];
    }

    public static function upgrade(string $inicioOriginal,string $anterior,int $prazo,string $precoAntigo,string $precoNovo): array
    {
        $old=VendaMoney::cents($precoAntigo);
        $new=VendaMoney::cents($precoNovo);
        if($old===null || $new===null || $new<=$old)throw new \InvalidArgumentException('O novo plano deve ser de valor superior.');
        return [
            'inicio'=>$inicioOriginal,
            'vencimento'=>max($anterior,self::vencimento($inicioOriginal,$prazo)),
            'adicional'=>VendaMoney::decimal($new-$old),
        ];
    }

    public static function vencimento(string $inicio, int $meses): string
    {
        $date=new \DateTimeImmutable($inicio.' 12:00:00');
        $first=$date->modify('first day of this month')->modify('+'.$meses.' months');
        $day=min((int)$date->format('d'), (int)$first->format('t'));
        return $first->setDate((int)$first->format('Y'),(int)$first->format('m'),$day)->format('Y-m-d');
    }
}
