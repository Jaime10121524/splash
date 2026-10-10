<?php
declare(strict_types=1);
namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;

/** Fechamento independente de cada responsável. NUNCA agrupa todos os corretores implicitamente. */
class FechamentosPeriodos extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'corretor_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'responsavel_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('corretor_pessoa_id','uq_fe_resp_corretor');
        $this->forge->addKey('responsavel_pessoa_id');
        $this->forge->addForeignKey('corretor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_fe_resp_cor');
        $this->forge->addForeignKey('responsavel_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_fe_resp_gestor');
        $this->forge->createTable('fechamento_responsabilidades',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'responsavel_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'inicio'=>['type'=>'DATE'],'fim'=>['type'=>'DATE'],
            'status'=>['type'=>'VARCHAR','constraint'=>18,'default'=>'RECEBIMENTOS'],
            'resumo_concluido'=>['type'=>'LONGTEXT','null'=>true],
            'concluido_em'=>['type'=>'DATETIME','null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey(['responsavel_pessoa_id','inicio','fim'],'uq_fe_periodo');
        $this->forge->addForeignKey('responsavel_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_fe_owner');
        $this->forge->createTable('fechamento_periodos',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'pessoa_id'=>['type'=>'INT','unsigned'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey(['fechamento_id','pessoa_id'],'uq_fe_pessoas');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_membros_periodo');
        $this->forge->addForeignKey('pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_fe_membros_pessoa');
        $this->forge->createTable('fechamento_periodo_pessoas',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('operacao_id','uq_fe_venda_unica');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_vendas_periodo');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_fe_vendas_operacao');
        $this->forge->createTable('fechamento_periodo_vendas',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'corretor_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'forma_id'=>['type'=>'INT','unsigned'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'data_recebimento'=>['type'=>'DATE'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['fechamento_id','corretor_pessoa_id']);
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_entrada_periodo');
        $this->forge->addForeignKey('corretor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_fe_entrada_corretor');
        $this->forge->createTable('fechamento_periodo_entradas',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'emprestimo_id'=>['type'=>'INT','unsigned'=>true],
            'lote_id'=>['type'=>'INT','unsigned'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['fechamento_id','emprestimo_id']);
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_abate_periodo');
        $this->forge->addForeignKey('emprestimo_id','financeiro_emprestimos','id','RESTRICT','RESTRICT','fk_fe_abate_emp');
        $this->forge->addForeignKey('lote_id','comissao_lotes_pagamento','id','RESTRICT','RESTRICT','fk_fe_abate_lote');
        $this->forge->createTable('fechamento_periodo_abates',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'rateio_id'=>['type'=>'INT','unsigned'=>true],
            'movimento_id'=>['type'=>'INT','unsigned'=>true],
            'forma_id'=>['type'=>'INT','unsigned'=>true],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'ATIVO'],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('movimento_id','uq_fe_repasse_mov');
        $this->forge->addKey('fechamento_id');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_pag_periodo');
        $this->forge->addForeignKey('rateio_id','comissao_rateios','id','RESTRICT','RESTRICT','fk_fe_pag_rateio');
        $this->forge->addForeignKey('movimento_id','comissao_repasses','id','RESTRICT','RESTRICT','fk_fe_pag_mov');
        $this->forge->createTable('fechamento_periodo_repasses',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'movimento_id'=>['type'=>'INT','unsigned'=>true],
            'forma_id'=>['type'=>'INT','unsigned'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'ATIVO'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('movimento_id','uq_fe_titular_mov');
        $this->forge->addKey('fechamento_id');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_tit_periodo');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_fe_tit_operacao');
        $this->forge->addForeignKey('movimento_id','comissao_titular_movimentos','id','RESTRICT','RESTRICT','fk_fe_tit_mov');
        $this->forge->createTable('fechamento_periodo_titulares',true);

        $this->createEventTable();
    }

    // Chave por evento de caixa, para que o mesmo POST não lance dinheiro duas vezes.
    private function createEventTable(): void
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'chave_requisicao'=>['type'=>'VARCHAR','constraint'=>64],
            'tipo'=>['type'=>'VARCHAR','constraint'=>16],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey(['fechamento_id','chave_requisicao'],'uq_fe_evento_unico');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_fe_evento_periodo');
        $this->forge->createTable('fechamento_periodo_eventos',true);
    }

    public function down()
    {
        foreach(['fechamento_periodo_eventos','fechamento_periodo_titulares','fechamento_periodo_repasses','fechamento_periodo_abates',
            'fechamento_periodo_entradas','fechamento_periodo_vendas',
            'fechamento_periodo_pessoas','fechamento_periodos',
            'fechamento_responsabilidades'] as $table)$this->forge->dropTable($table,true);
    }
}
