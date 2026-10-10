<?php
declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class FinanceiroPessoal extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome'=>['type'=>'VARCHAR','constraint'=>90],
            'pessoa_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'ativo'=>['type'=>'TINYINT','constraint'=>1,'default'=>1],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addForeignKey('pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_categoria_fin_pessoa');
        $this->forge->createTable('financeiro_categorias_despesa',true);
        foreach(['Alimentação','Anúncios','Transporte','Bonificações','Hospedagem','Outros'] as $categoria){
            $this->db->table('financeiro_categorias_despesa')->insert(['nome'=>$categoria,'pessoa_id'=>null,'ativo'=>1]);
        }

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'categoria_id'=>['type'=>'INT','unsigned'=>true],
            'data_despesa'=>['type'=>'DATE'],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'descricao'=>['type'=>'VARCHAR','constraint'=>500],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'ATIVA'],
            'justificativa_cancelamento'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['pessoa_id','data_despesa']);
        $this->forge->addForeignKey('pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_despesa_fin_pessoa');
        $this->forge->addForeignKey('categoria_id','financeiro_categorias_despesa','id','RESTRICT','RESTRICT','fk_despesa_fin_categoria');
        $this->forge->createTable('financeiro_despesas',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'data_emprestimo'=>['type'=>'DATE'],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'descricao'=>['type'=>'VARCHAR','constraint'=>500],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'ATIVO'],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['pessoa_id','data_emprestimo']);
        $this->forge->addForeignKey('pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_emprestimo_fin_pessoa');
        $this->forge->createTable('financeiro_emprestimos',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'emprestimo_id'=>['type'=>'INT','unsigned'=>true],
            'lote_id'=>['type'=>'INT','unsigned'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'data_abate'=>['type'=>'DATE'],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['emprestimo_id','lote_id']);
        $this->forge->addForeignKey('emprestimo_id','financeiro_emprestimos','id','RESTRICT','RESTRICT','fk_abate_fin_emprestimo');
        $this->forge->addForeignKey('lote_id','comissao_lotes_pagamento','id','RESTRICT','RESTRICT','fk_abate_fin_lote');
        $this->forge->createTable('financeiro_emprestimo_abates',true);

        $this->forge->addColumn('comissao_lotes_pagamento',[
            'valor_transferido'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
            'valor_abate'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
        ]);
        // Único meio contábil interno; não é transferência bancária nem recebimento do associado.
        $existing=$this->db->table('venda_formas_pagamento')->where('codigo','ABATIMENTO_EMP')->get()->getRowArray();
        if(!$existing)$this->db->table('venda_formas_pagamento')->insert([
            'codigo'=>'ABATIMENTO_EMP','nome'=>'Abatimento de empréstimo',
            'credito'=>0,'ativo'=>1,
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('comissao_lotes_pagamento',['valor_transferido','valor_abate']);
        $this->forge->dropTable('financeiro_emprestimo_abates',true);
        $this->forge->dropTable('financeiro_emprestimos',true);
        $this->forge->dropTable('financeiro_despesas',true);
        $this->forge->dropTable('financeiro_categorias_despesa',true);
    }
}
