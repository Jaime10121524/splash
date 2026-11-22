<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Agendamentos são leads comerciais, não títulos financeiros.
 * O QR usa um token imprevisível; a leitura exige usuário autenticado.
 * A captura e o comparecimento não devem sobrescrever o dono da corrente.
 */
final class CreateAgendamentosSplash extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome_completo' => ['type'=>'VARCHAR','constraint'=>160],
            'telefone' => ['type'=>'VARCHAR','constraint'=>11],
            'data_visita' => ['type'=>'DATE'],
            'quantidade_pessoas' => ['type'=>'INT','unsigned'=>true],
            'captador_pessoa_id' => ['type'=>'INT','unsigned'=>true],
            'corretor_confirmado_pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'segundo_corretor_pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'atendente_pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'cliente_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'visita_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'situacao' => ['type'=>'VARCHAR','constraint'=>20,'default'=>'AGENDADO'],
            'qr_token' => ['type'=>'CHAR','constraint'=>64],
            'observacoes' => ['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id' => ['type'=>'INT','unsigned'=>true],
            'recebido_por_usuario_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'criado_em' => ['type'=>'DATETIME'],
            'atualizado_em' => ['type'=>'DATETIME','null'=>true],
            'compareceu_em' => ['type'=>'DATETIME','null'=>true],
            'cancelado_em' => ['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('qr_token','uq_agendamento_qr');
        $this->forge->addUniqueKey('visita_id','uq_agendamento_visita');
        $this->forge->addKey(['data_visita','situacao']);
        $this->forge->addKey(['captador_pessoa_id','data_visita']);
        $this->forge->addForeignKey('captador_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_agend_captador');
        $this->forge->addForeignKey('corretor_confirmado_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_agend_corretor');
        $this->forge->addForeignKey('segundo_corretor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_agend_segundo');
        $this->forge->addForeignKey('atendente_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_agend_atendente');
        $this->forge->addForeignKey('cliente_id','clientes','id','RESTRICT','RESTRICT','fk_agend_cliente');
        $this->forge->addForeignKey('visita_id','visitas','id','RESTRICT','RESTRICT','fk_agend_visita');
        $this->forge->addForeignKey('criado_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_agend_criado');
        $this->forge->addForeignKey('recebido_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_agend_recebido');
        $this->forge->createTable('agendamentos',true);

        // Origem própria para leads que surgiram somente no agendamento.
        $exists=$this->db->table('lead_origens')->where('nome','Agendamento')->get()->getRowArray();
        if (!$exists) {
            $this->db->table('lead_origens')->insert([
                'nome'=>'Agendamento','ativo'=>1,'permite_indicador'=>0,
                'criado_em'=>date('Y-m-d H:i:s'),
            ]);
        }
    }

    public function down()
    {
        $this->forge->dropTable('agendamentos',true);
        // Preserva a origem Agendamento caso já seja usada por clientes.
    }
}
