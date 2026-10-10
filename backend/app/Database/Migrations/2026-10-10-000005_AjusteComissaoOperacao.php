<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class AjusteComissaoOperacao extends Migration
{
    public function up()
    {
        $this->forge->addColumn('venda_operacoes',[
            'comissao_ajustada'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
            'ajuste_motivo'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('venda_operacoes',['comissao_ajustada','ajuste_motivo']);
    }
}
