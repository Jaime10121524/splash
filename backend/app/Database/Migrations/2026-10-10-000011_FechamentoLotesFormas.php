<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Um pagamento ao participante pode abranger várias vendas e várias formas.
 * Cada parcela é lançada no movimento existente da comissão de sua venda.
 */
class FechamentoLotesFormas extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'periodo_inicio'=>['type'=>'DATE'],
            'periodo_fim'=>['type'=>'DATE'],
            'data_pagamento'=>['type'=>'DATE'],
            'valor_total'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'chave_requisicao'=>['type'=>'VARCHAR','constraint'=>64],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['pessoa_id','periodo_inicio','periodo_fim']);
        $this->forge->addUniqueKey('chave_requisicao','uq_lote_idempotencia');
        $this->forge->addForeignKey('pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_lote_pessoa');
        $this->forge->createTable('comissao_lotes_pagamento',true);

        $fields=[
            'lote_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'forma_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
        ];
        $this->forge->addColumn('comissao_repasses',$fields);
        $this->forge->addColumn('comissao_titular_movimentos',$fields);
        // Histórico existente permanece com forma_id NULL = não informado.
        // Evita assumir Pix ou dinheiro para pagamentos antigos.
    }

    public function down()
    {
        $this->forge->dropColumn('comissao_titular_movimentos',['lote_id','forma_id']);
        $this->forge->dropColumn('comissao_repasses',['lote_id','forma_id']);
        $this->forge->dropTable('comissao_lotes_pagamento',true);
    }
}
