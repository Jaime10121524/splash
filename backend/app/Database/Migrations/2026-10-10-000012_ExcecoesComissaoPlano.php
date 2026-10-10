<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Valor fixo ou percentual por plano, forma (à vista/cartão/misto), dia e função.
 * Não altera rateios já apurados/pagos: configura apenas os futuros.
 */
class ExcecoesComissaoPlano extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'plano_versao_id'=>['type'=>'INT','unsigned'=>true],
            'modalidade'=>['type'=>'VARCHAR','constraint'=>10],
            'tipo_dia'=>['type'=>'VARCHAR','constraint'=>10],
            'papel'=>['type'=>'VARCHAR','constraint'=>12],
            'tipo_calculo'=>['type'=>'VARCHAR','constraint'=>12],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>350,'null'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey(['plano_versao_id','modalidade','tipo_dia','papel'],'uq_excecao_plano');
        $this->forge->addForeignKey('plano_versao_id','plano_versoes','id','RESTRICT','RESTRICT','fk_excecao_versao');
        $this->forge->createTable('comissao_excecoes_plano',true);
    }

    public function down()
    {
        $this->forge->dropTable('comissao_excecoes_plano',true);
    }
}
