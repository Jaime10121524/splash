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
        // A chave estrangeira fk_fe_owner (responsavel_pessoa_id -> pessoas.id)
        // pode estar sustentada pelo índice UNIQUE original. MySQL/MariaDB
        // recusam DROP INDEX enquanto não existir outro índice compatível.
        // Cria PRIMEIRO o índice não exclusivo com o mesmo prefixo.
        // Operação idempotente caso uma tentativa anterior tenha parado no meio.
        $index = $this->db->query("SHOW INDEX FROM fechamento_periodos WHERE Key_name = 'ix_fe_periodo'")
            ->getResultArray();
        if (!$index) {
            $this->db->query('CREATE INDEX ix_fe_periodo ON fechamento_periodos (responsavel_pessoa_id, inicio, fim)');
        }

        $existing = $this->db->query("SHOW INDEX FROM fechamento_periodos WHERE Key_name = 'uq_fe_periodo'")
            ->getResultArray();
        if ($existing) {
            $this->db->query('ALTER TABLE fechamento_periodos DROP INDEX uq_fe_periodo');
        }
    }

    public function down()
    {
        // Não recriar índice UNIQUE: múltiplos períodos cancelados podem ter
        // as mesmas datas; reaplicá-lo derrubaria dados válidos em produção.
    }
}
