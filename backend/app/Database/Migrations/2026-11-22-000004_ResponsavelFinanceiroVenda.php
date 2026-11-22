<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Responsável operacional pela arrecadação e repasses desta venda.
 * Independente do dono da corrente do cliente e dos beneficiários de comissão.
 */
final class ResponsavelFinanceiroVenda extends Migration
{
    public function up()
    {
        $this->forge->addColumn('venda_operacoes', [
            'responsavel_financeiro_pessoa_id'=>[
                'type'=>'INT','unsigned'=>true,'null'=>true,
                'after'=>'dono_corrente_pessoa_id',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('venda_operacoes','responsavel_financeiro_pessoa_id');
    }
}
