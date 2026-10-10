<?php

declare(strict_types=1);

namespace App\Libraries;

final class RateioRules
{
    public const ROLES=['CORRETOR','ATENDENTE','GERENTE'];

    /**
     * Valida transferências de comissão entre participantes, em centavos.
     * O corretor responsável recebe a comissão inicial. Cada terceiro pode
     * repartir apenas o que recebeu. Ciclos e saldo negativo são proibidos.
     *
     * @param array<int,array{origem:int,destino:int,valor:int,papel:string}> $rows
     * @return array<int,int> saldo final por pessoa
     */
    public static function balances(int $root,int $commission,array $rows): array
    {
        if($root<1 || $commission<0)throw new \InvalidArgumentException('Operação ou comissão inválida.');
        $graph=[];
        $seen=[];
        $people=[$root=>true];
        foreach($rows as $item){
            $from=(int)($item['origem']??0);
            $to=(int)($item['destino']??0);
            $value=(int)($item['valor']??0);
            $role=(string)($item['papel']??'');
            if($from<1||$to<1||$from===$to||$value<1||!in_array($role,self::ROLES,true)){
                throw new \InvalidArgumentException('Participantes, papel ou valor do rateio inválidos.');
            }
            $key=$from.'-'.$to.'-'.$role;
            if(isset($seen[$key]))throw new \InvalidArgumentException('Rateio duplicado para a mesma pessoa e função.');
            $seen[$key]=true;
            $graph[$from][]=['to'=>$to,'value'=>$value];
            $people[$from]=true;$people[$to]=true;
        }
        $state=[];$order=[];
        $walk=function(int $id) use(&$walk,&$state,&$order,$graph){
            if(($state[$id]??0)===1)throw new \InvalidArgumentException('Rateios circulares não são permitidos.');
            if(($state[$id]??0)===2)return;
            $state[$id]=1;
            foreach($graph[$id]??[] as $item)$walk($item['to']);
            $state[$id]=2;$order[]=$id;
        };
        foreach(array_keys($people) as $id)$walk($id);
        $balances=array_fill_keys(array_keys($people),0);
        $balances[$root]=$commission;
        foreach(array_reverse($order) as $id){
            foreach($graph[$id]??[] as $edge){
                if($balances[$id]<$edge['value']){
                    throw new \InvalidArgumentException('Uma pessoa está repassando mais do que sua comissão disponível.');
                }
                $balances[$id]-=$edge['value'];
                $balances[$edge['to']]+=$edge['value'];
            }
        }
        return $balances;
    }
}
