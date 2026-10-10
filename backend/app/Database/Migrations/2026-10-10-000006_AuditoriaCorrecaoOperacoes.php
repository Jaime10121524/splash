<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Histórico de alterações cadastrais. Movimentos financeiros incorretos são
 * corrigidos com ESTORNO referenciado, nunca UPDATE ou DELETE da entrada.
 */
class AuditoriaCorrecaoOperacoes extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'acao'=>['type'=>'VARCHAR','constraint'=>30],
            'dados_antes'=>['type'=>'LONGTEXT'],
            'dados_depois'=>['type'=>'LONGTEXT'],
            'justificativa'=>['type'=>'VARCHAR','constraint'=>500],
            'usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('operacao_id');
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_operacao_edicao_auditoria');
        $this->forge->createTable('venda_operacoes_auditoria',true);
    }

    public function down()
    {
        $this->forge->dropTable('venda_operacoes_auditoria',true);
    }
}
