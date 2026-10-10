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
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'valor_anterior'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
            'valor_novo'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
            'justificativa'=>['type'=>'VARCHAR','constraint'=>500],
            'usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('operacao_id');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_comissao_ajuste_operacao');
        $this->forge->createTable('venda_comissao_ajustes',true);
    }

    public function down()
    {
        $this->forge->dropTable('venda_comissao_ajustes',true);
        $this->forge->dropColumn('venda_operacoes',['comissao_ajustada','ajuste_motivo']);
    }
}
