<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Um plano é uma família estável; cada reajuste cria uma versão imutável.
 * Não removemos versões históricas: futuras vendas referenciarão a versão.
 */
class CreatePlanosEVersoes extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type' => 'INT', 'constraint' => 11,
                'unsigned' => true, 'auto_increment' => true,
            ],
            'criado_em' => ['type' => 'DATETIME', 'null' => false],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('planos', true);

        $this->forge->addField([
            'id' => [
                'type' => 'INT', 'constraint' => 11,
                'unsigned' => true, 'auto_increment' => true,
            ],
            'plano_id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true],
            'versao' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true],
            'codigo' => ['type' => 'VARCHAR', 'constraint' => 40],
            'valor' => ['type' => 'DECIMAL', 'constraint' => '15,2'],
            'duracao_meses' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true],
            'ativo' => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'vigencia_inicio' => ['type' => 'DATE', 'null' => true],
            'criado_em' => ['type' => 'DATETIME', 'null' => false],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('codigo', 'uq_plano_versao_codigo');
        $this->forge->addUniqueKey(['plano_id', 'versao'], 'uq_plano_versao_numero');
        $this->forge->addKey('plano_id');
        $this->forge->addForeignKey('plano_id', 'planos', 'id', 'RESTRICT', 'RESTRICT', 'fk_plano_versao');
        $this->forge->createTable('plano_versoes', true);
    }

    public function down()
    {
        $this->forge->dropTable('plano_versoes', true);
        $this->forge->dropTable('planos', true);
    }
}
