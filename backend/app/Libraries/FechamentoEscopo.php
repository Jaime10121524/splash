<?php
declare(strict_types=1);
namespace App\Libraries;

/** Regra pura: somente vínculo administrativo EXPLÍCITO agrupa corretores.
 * Dono da corrente do cliente nunca compõe este mapa.
 */
final class FechamentoEscopo
{
    public static function membros(int $responsavelId,array $vinculos): array
    {
        $ids=[$responsavelId=>true];
        foreach($vinculos as $v){
            if((int)$v['responsavel_pessoa_id']===$responsavelId){
                $ids[(int)$v['corretor_pessoa_id']]=true;
            }
        }
        $result=array_keys($ids);
        sort($result,SORT_NUMERIC);
        return $result;
    }

    public static function podeIniciar(int $idUsuarioPessoa,int $responsavelId,bool $administrador,array $vinculos): bool
    {
        foreach($vinculos as $v){
            if((int)$v['corretor_pessoa_id']===$responsavelId)return false;
        }
        return $administrador || $idUsuarioPessoa===$responsavelId;
    }
}
