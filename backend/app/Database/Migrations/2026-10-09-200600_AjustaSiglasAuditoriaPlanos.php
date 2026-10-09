<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Código do plano é uma SIGLA (P/T, R/T); número de 4 dígitos será por venda.
 * Uma mesma sigla pode permanecer durante reajustes de valor; não pode ser unique.
 * Registra alterações/correções e exclusões para auditoria.
 */
class AjustaSiglasAuditoriaPlanos extends Migration
{
    public function up()
    {
        $indexes = $this->db->query("SHOW INDEX FROM plano_versoes WHERE Key_name = 'uq_plano_versao_codigo'")->getResultArray();
        if ($indexes !== []) {
            $this->db->query('ALTER TABLE plano_versoes DROP INDEX uq_plano_versao_codigo');
        }
        $this->forge->addField([
            'id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true, 'auto_increment' => true],
            'plano_id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true],
            'versao_id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true, 'null' => true],
            'acao' => ['type' => 'VARCHAR', 'constraint' => 20],
            'antes' => ['type' => 'TEXT', 'null' => true],
            'depois' => ['type' => 'TEXT', 'null' => true],
            'usuario_id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true, 'null' => true],
            'criado_em' => ['type' => 'DATETIME'],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey('plano_id');
        $this->forge->createTable('plano_alteracoes', true);
    }

    public function down()
    {
        $this->forge->dropTable('plano_alteracoes', true);
        // Não restaura unique(codigo): pode haver legítimas versões com a mesma sigla.
        // O histórico nunca deve ser invalidado por um rollback.
    }
}
