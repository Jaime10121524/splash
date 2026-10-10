<?php
declare(strict_types=1);

namespace App\Libraries;

/**
 * Isolamento do extrato: valores de terceiros pertencem à operação somente
 * do administrador ou do corretor independente; nunca a um delegado/vendedor.
 */
final class ExtratoPermissoes
{
    public static function repasses(bool $admin,bool $corretor,bool $delegado): bool
    {
        return $admin || ($corretor && !$delegado);
    }

    public static function financeiroPessoal(bool $admin,bool $corretor): bool
    {
        return $admin || $corretor;
    }
}
