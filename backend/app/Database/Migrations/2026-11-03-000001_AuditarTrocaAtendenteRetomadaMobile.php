<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Guarda o atendente anterior e o novo responsável quando a retomada de
 * uma visita no mesmo dia troca o responsável pelo atendimento.
 * Não altera nem recalcula a corrente, os corretores ou as comissões.
 */
class AuditarTrocaAtendenteRetomadaMobile extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'visita_id' => ['type' => 'INT', 'unsigned' => true],
            'atendente_anterior_pessoa_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'atendente_novo_pessoa_id' => ['type' => 'INT', 'unsigned' => true],
            'adicional_anterior_pessoa_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'adicional_novo_pessoa_id' => ['type' => 'INT', 'unsigned' => true, 'null' => true],
            'usuario_id' => ['type' => 'INT', 'unsigned' => true],
            'criado_em' => ['type' => 'DATETIME'],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['visita_id', 'criado_em']);
        $this->forge->addForeignKey('visita_id', 'visitas', 'id', 'RESTRICT', 'RESTRICT', 'fk_troca_atendente_visita');
        $this->forge->addForeignKey('atendente_anterior_pessoa_id', 'pessoas', 'id', 'RESTRICT', 'RESTRICT', 'fk_troca_atendente_antes');
        $this->forge->addForeignKey('atendente_novo_pessoa_id', 'pessoas', 'id', 'RESTRICT', 'RESTRICT', 'fk_troca_atendente_depois');
        $this->forge->addForeignKey('adicional_anterior_pessoa_id', 'pessoas', 'id', 'RESTRICT', 'RESTRICT', 'fk_troca_adicional_antes');
        $this->forge->addForeignKey('adicional_novo_pessoa_id', 'pessoas', 'id', 'RESTRICT', 'RESTRICT', 'fk_troca_adicional_depois');
        $this->forge->addForeignKey('usuario_id', 'users', 'id', 'RESTRICT', 'RESTRICT', 'fk_troca_atendente_usuario');
        $this->forge->createTable('visita_atendente_trocas', true);
    }

    public function down()
    {
        $this->forge->dropTable('visita_atendente_trocas', true);
    }
}
