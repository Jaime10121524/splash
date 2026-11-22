<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Movimentos de dinheiro antecipado durante uma pendência.
 * Não são comissões apuradas nem pagamentos definitivos.
 * Estornos são linhas novas, nunca exclusão de histórico.
 */
final class PendenciaCustodiaAdiantamentos extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'tipo'=>['type'=>'VARCHAR','constraint'=>12],
            'referencia_adiantamento_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'origem'=>['type'=>'VARCHAR','constraint'=>12],
            'beneficiario_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'valor'=>['type'=>'DECIMAL','constraint'=>'12,2'],
            'data_movimento'=>['type'=>'DATE'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('operacao_id');
        $this->forge->addKey('referencia_adiantamento_id');
        $this->forge->createTable('pendencia_adiantamentos',true);
    }

    public function down()
    {
        $this->forge->dropTable('pendencia_adiantamentos',true);
    }
}
