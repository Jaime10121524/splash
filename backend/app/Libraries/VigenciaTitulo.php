<?php
namespace App\Libraries;

final class VigenciaTitulo
{
    public static function vencimento(string $inicio, int $meses): string
    {
        $date=new \DateTimeImmutable($inicio.' 12:00:00');
        $first=$date->modify('first day of this month')->modify('+'.$meses.' months');
        $day=min((int)$date->format('d'), (int)$first->format('t'));
        return $first->setDate((int)$first->format('Y'),(int)$first->format('m'),$day)->format('Y-m-d');
    }
}
