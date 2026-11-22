<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Pagamento de bonificação a cliente indicador; uma bonificação por indicado.
 * O pagamento é uma despesa na conta da pessoa titular da corrente, não comissão de venda.
 */
final class BonificacoesIndicacao extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'cliente_indicado_id'=>['type'=>'INT','unsigned'=>true],
            'indicador_cliente_id'=>['type'=>'INT','unsigned'=>true],
            'pessoa_financeira_id'=>['type'=>'INT','unsigned'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'PENDENTE'],
            'financeiro_despesa_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'data_pagamento'=>['type'=>'DATE','null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'confirmado_por_usuario_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('cliente_indicado_id','uq_indicacao_bonificacao_indicado');
        $this->forge->addUniqueKey('financeiro_despesa_id','uq_indicacao_bonificacao_despesa');
        $this->forge->addKey(['pessoa_financeira_id','situacao']);
        $this->forge->addForeignKey('cliente_indicado_id','clientes','id','RESTRICT','RESTRICT','fk_bonif_indicado');
        $this->forge->addForeignKey('indicador_cliente_id','clientes','id','RESTRICT','RESTRICT','fk_bonif_indicador');
        $this->forge->addForeignKey('pessoa_financeira_id','pessoas','id','RESTRICT','RESTRICT','fk_bonif_conta');
        $this->forge->addForeignKey('financeiro_despesa_id','financeiro_despesas','id','RESTRICT','RESTRICT','fk_bonif_despesa');
        $this->forge->addForeignKey('criado_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_bonif_usuario');
        $this->forge->addForeignKey('confirmado_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_bonif_confirmado');
        $this->forge->createTable('indicacao_bonificacoes',true);
    }
    public function down()
    {
        $this->forge->dropTable('indicacao_bonificacoes',true);
    }
}
