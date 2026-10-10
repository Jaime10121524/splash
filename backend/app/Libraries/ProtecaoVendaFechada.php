<?php
declare(strict_types=1);

namespace App\Libraries;

/** Proteção uniforme de vendas incluídas em QUALQUER fechamento de período. */
final class ProtecaoVendaFechada
{
    public const MESSAGE='Venda vinculada a um fechamento. Cadastro, recebimentos e comissões estão bloqueados. Consulte o fechamento original.';

    public static function fechamento($db,int $operacaoId): ?array
    {
        return $db->table('fechamento_periodo_vendas fv')
            ->select('f.id,f.status,f.inicio,f.fim,f.responsavel_pessoa_id')
            ->join('fechamento_periodos f','f.id=fv.fechamento_id')
            ->where('fv.operacao_id',$operacaoId)->orderBy('f.id','DESC')
            ->get()->getRowArray();
    }

    public static function bloqueada($db,int $operacaoId): bool
    {
        return self::fechamento($db,$operacaoId)!==null;
    }
}
