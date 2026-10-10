<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class RateioAutomaticoPoliticas extends Migration
{
    public function up()
    {
        $this->forge->addColumn('venda_operacoes', [
            'gerente_pessoa_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
        ]);
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'percentual_atendente_dia_util'=>['type'=>'DECIMAL','constraint'=>'5,2','default'=>'10.00'],
            'percentual_atendente_outros_dias'=>['type'=>'DECIMAL','constraint'=>'5,2','default'=>'5.00'],
            'percentual_gerente'=>['type'=>'DECIMAL','constraint'=>'5,2','default'=>'5.00'],
            'divisao_segundo_corretor'=>['type'=>'DECIMAL','constraint'=>'5,2','default'=>'50.00'],
            'alterado_em'=>['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->createTable('comissao_politicas',true);
        $this->db->table('comissao_politicas')->insert(['id'=>1]);

        $this->forge->addField([
            'data'=>['type'=>'DATE'],
            'descricao'=>['type'=>'VARCHAR','constraint'=>120],
        ]);
        $this->forge->addKey('data',true);
        $this->forge->createTable('comissao_feriados',true);

        $this->forge->addField([
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'status'=>['type'=>'VARCHAR','constraint'=>20],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>700,'null'=>true],
            'gerado_em'=>['type'=>'DATETIME'],
            'gerado_por_usuario_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
        ]);
        $this->forge->addKey('operacao_id',true);
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_auto_rateio_operacao');
        $this->forge->createTable('comissao_auto_apuracoes',true);
    }

    public function down()
    {
        $this->forge->dropTable('comissao_auto_apuracoes',true);
        $this->forge->dropTable('comissao_feriados',true);
        $this->forge->dropTable('comissao_politicas',true);
        $this->forge->dropColumn('venda_operacoes','gerente_pessoa_id');
    }
}
