<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Etapa financeira: origem/beneficiário explícitos, sem misturar contas.
 * Não remove/atualiza movimentos de vendas anteriores.
 */
class CreateRateiosRepasses extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'responsavel_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'beneficiario_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'papel'=>['type'=>'VARCHAR','constraint'=>20],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['responsavel_pessoa_id','operacao_id']);
        $this->forge->addKey('beneficiario_pessoa_id');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_rateio_venda');
        $this->forge->addForeignKey('responsavel_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_rateio_responsavel');
        $this->forge->addForeignKey('beneficiario_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_rateio_beneficiario');
        $this->forge->createTable('comissao_rateios',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'rateio_id'=>['type'=>'INT','unsigned'=>true],
            'tipo'=>['type'=>'VARCHAR','constraint'=>12],
            'referencia_pagamento_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'data_pagamento'=>['type'=>'DATE'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('rateio_id');
        $this->forge->addForeignKey('rateio_id','comissao_rateios','id','RESTRICT','RESTRICT','fk_repasse_rateio');
        $this->forge->addForeignKey('referencia_pagamento_id','comissao_repasses','id','RESTRICT','RESTRICT','fk_repasse_referencia');
        $this->forge->createTable('comissao_repasses',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'dados_antes'=>['type'=>'LONGTEXT'],
            'dados_depois'=>['type'=>'LONGTEXT'],
            'justificativa'=>['type'=>'VARCHAR','constraint'=>500],
            'usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('operacao_id');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_rateio_auditoria_venda');
        $this->forge->createTable('comissao_rateios_auditoria',true);
    }

    public function down()
    {
        $this->forge->dropTable('comissao_rateios_auditoria',true);
        $this->forge->dropTable('comissao_repasses',true);
        $this->forge->dropTable('comissao_rateios',true);
    }
}
