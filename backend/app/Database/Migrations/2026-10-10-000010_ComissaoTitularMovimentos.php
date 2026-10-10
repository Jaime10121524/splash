<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/** Pagamentos efetivos da parcela própria do corretor principal.
 * Valores de participações de terceiros continuam em comissao_repasses.
 */
class ComissaoTitularMovimentos extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'corretor_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'tipo'=>['type'=>'VARCHAR','constraint'=>12],
            'referencia_pagamento_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'data_pagamento'=>['type'=>'DATE'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['operacao_id','corretor_pessoa_id']);
        $this->forge->addKey('referencia_pagamento_id');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_titular_operacao');
        $this->forge->addForeignKey('corretor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_titular_pessoa');
        $this->forge->createTable('comissao_titular_movimentos',true);
    }

    public function down()
    {
        $this->forge->dropTable('comissao_titular_movimentos',true);
    }
}
