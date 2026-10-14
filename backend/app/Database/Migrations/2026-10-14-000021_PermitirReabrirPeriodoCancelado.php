<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Cancelar fechamento libera suas vendas e permite iniciar outro fechamento
 * do mesmo responsável e intervalo. A sobreposição ativa é validada no
 * FechamentosPeriodosController com lock da pessoa responsável.
 */
class PermitirReabrirPeriodoCancelado extends Migration
{
    public function up()
    {
        // O deploy usa MariaDB/MySQL. Evita alterar índices de SQLite nos testes.
        if ($this->db->DBDriver !== 'MySQLi') return;
        $existing = $this->db->query("SHOW INDEX FROM fechamento_periodos WHERE Key_name = 'uq_fe_periodo'")
            ->getResultArray();
        if ($existing) {
            $this->db->query('ALTER TABLE fechamento_periodos DROP INDEX uq_fe_periodo');
        }
        $index = $this->db->query("SHOW INDEX FROM fechamento_periodos WHERE Key_name = 'ix_fe_periodo'")
            ->getResultArray();
        if (!$index) {
            $this->db->query('CREATE INDEX ix_fe_periodo ON fechamento_periodos (responsavel_pessoa_id, inicio, fim)');
        }
    }

    public function down()
    {
        // Não recriar índice UNIQUE: múltiplos períodos cancelados podem ter
        // as mesmas datas; reaplicá-lo derrubaria dados válidos em produção.
    }
}
