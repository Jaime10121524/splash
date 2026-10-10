<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Preserva visitas antigas; os corretores anteriores permanecem NULL até
 * serem identificados, nunca inferidos a partir do dono da corrente.
 */
class RevisarVisitasCorretoresSessoes extends Migration
{
    public function up()
    {
        $this->forge->addColumn('visitas', [
            'corretor_pessoa_id' => ['type'=>'INT', 'unsigned'=>true, 'null'=>true, 'after'=>'cliente_id'],
            'segundo_corretor_pessoa_id' => ['type'=>'INT', 'unsigned'=>true, 'null'=>true, 'after'=>'corretor_pessoa_id'],
        ]);
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'visita_id'=>['type'=>'INT','unsigned'=>true],
            'inicio_em'=>['type'=>'DATETIME'],
            'fim_em'=>['type'=>'DATETIME','null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['visita_id','inicio_em']);
        $this->forge->addForeignKey('visita_id','visitas','id','RESTRICT','RESTRICT','fk_sessao_visita');
        $this->forge->createTable('visita_sessoes',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'visita_id'=>['type'=>'INT','unsigned'=>true],
            'resultado'=>['type'=>'VARCHAR','constraint'=>25],
            'motivo_nao_venda_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'retorno_previsto'=>['type'=>'DATE','null'=>true],
            'observacoes'=>['type'=>'TEXT','null'=>true],
            'criado_em'=>['type'=>'DATETIME'],
            'usuario_id'=>['type'=>'INT','unsigned'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('visita_id');
        $this->forge->addForeignKey('visita_id','visitas','id','RESTRICT','RESTRICT','fk_resultado_visita');
        $this->forge->createTable('visita_resultados_historico',true);

        // Os dados anteriores ficam intactos; reconstruímos a primeira sessão
        // e o resultado já registrado para manter tempos e justificativas.
        $db=$this->db;
        $db->query('INSERT INTO visita_sessoes (visita_id,inicio_em,fim_em,criado_por_usuario_id)
            SELECT id,inicio_em,fim_em,criado_por_usuario_id FROM visitas WHERE inicio_em IS NOT NULL');
        $db->query("INSERT INTO visita_resultados_historico
            (visita_id,resultado,motivo_nao_venda_id,retorno_previsto,observacoes,criado_em,usuario_id)
            SELECT id,status,motivo_nao_venda_id,retorno_previsto,observacoes,
                   COALESCE(fim_em,chegada_em),criado_por_usuario_id
            FROM visitas WHERE status IN ('RETORNO','SEM_VENDA','PENDENCIA')");
    }

    public function down()
    {
        $this->forge->dropTable('visita_resultados_historico',true);
        $this->forge->dropTable('visita_sessoes',true);
        $this->forge->dropColumn('visitas',['segundo_corretor_pessoa_id','corretor_pessoa_id']);
    }
}
