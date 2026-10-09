<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Clientes, corrente de indicações e histórico de visitas.
 * Não gera venda, recebível ou comissão nesta etapa.
 */
class CreateClientesVisitas extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome' => ['type'=>'VARCHAR','constraint'=>90],
            'ativo' => ['type'=>'TINYINT','constraint'=>1,'default'=>1],
            'criado_em' => ['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->createTable('lead_origens',true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'descricao' => ['type'=>'VARCHAR','constraint'=>90],
            'ativo' => ['type'=>'TINYINT','constraint'=>1,'default'=>1],
            'criado_em' => ['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->createTable('motivos_nao_venda',true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome' => ['type'=>'VARCHAR','constraint'=>160],
            'telefone' => ['type'=>'VARCHAR','constraint'=>20],
            'cpf' => ['type'=>'VARCHAR','constraint'=>11,'null'=>true],
            'email' => ['type'=>'VARCHAR','constraint'=>254,'null'=>true],
            'data_nascimento' => ['type'=>'DATE','null'=>true],
            'endereco' => ['type'=>'TEXT','null'=>true],
            'profissao' => ['type'=>'VARCHAR','constraint'=>100,'null'=>true],
            'observacoes' => ['type'=>'TEXT','null'=>true],
            'origem_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'indicador_cliente_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'dono_corrente_pessoa_id' => ['type'=>'INT','unsigned'=>true],
            'ativo' => ['type'=>'TINYINT','constraint'=>1,'default'=>1],
            'criado_por_usuario_id' => ['type'=>'INT','unsigned'=>true],
            'criado_em' => ['type'=>'DATETIME'],
            'atualizado_em' => ['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('cpf','uq_clientes_cpf');
        $this->forge->addKey('telefone');
        $this->forge->addKey('dono_corrente_pessoa_id');
        $this->forge->addForeignKey('origem_id','lead_origens','id','RESTRICT','RESTRICT','fk_cliente_origem');
        $this->forge->addForeignKey('indicador_cliente_id','clientes','id','RESTRICT','RESTRICT','fk_cliente_indicador');
        $this->forge->addForeignKey('dono_corrente_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_cliente_dono');
        $this->forge->addForeignKey('criado_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_cliente_criador');
        $this->forge->createTable('clientes',true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'cliente_id' => ['type'=>'INT','unsigned'=>true],
            'dono_anterior_pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'dono_novo_pessoa_id' => ['type'=>'INT','unsigned'=>true],
            'origem' => ['type'=>'VARCHAR','constraint'=>30],
            'justificativa' => ['type'=>'VARCHAR','constraint'=>300,'null'=>true],
            'usuario_id' => ['type'=>'INT','unsigned'=>true],
            'criado_em' => ['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('cliente_id');
        $this->forge->addForeignKey('cliente_id','clientes','id','RESTRICT','RESTRICT','fk_corrente_cliente');
        $this->forge->addForeignKey('dono_anterior_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_corrente_antes');
        $this->forge->addForeignKey('dono_novo_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_corrente_depois');
        $this->forge->createTable('cliente_corrente_historico',true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'cliente_id' => ['type'=>'INT','unsigned'=>true],
            'atendente_pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'atendente_adicional_pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'status' => ['type'=>'VARCHAR','constraint'=>25,'default'=>'AGUARDANDO'],
            'chegada_em' => ['type'=>'DATETIME'],
            'inicio_em' => ['type'=>'DATETIME','null'=>true],
            'fim_em' => ['type'=>'DATETIME','null'=>true],
            'retorno_previsto' => ['type'=>'DATE','null'=>true],
            'motivo_nao_venda_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'observacoes' => ['type'=>'TEXT','null'=>true],
            'criado_por_usuario_id' => ['type'=>'INT','unsigned'=>true],
            'atualizado_em' => ['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['cliente_id','chegada_em']);
        $this->forge->addKey(['status','chegada_em']);
        $this->forge->addForeignKey('cliente_id','clientes','id','RESTRICT','RESTRICT','fk_visita_cliente');
        $this->forge->addForeignKey('atendente_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_visita_atendente');
        $this->forge->addForeignKey('atendente_adicional_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_visita_atendente2');
        $this->forge->addForeignKey('motivo_nao_venda_id','motivos_nao_venda','id','RESTRICT','RESTRICT','fk_visita_motivo');
        $this->forge->addForeignKey('criado_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_visita_criador');
        $this->forge->createTable('visitas',true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'visita_id' => ['type'=>'INT','unsigned'=>true],
            'status_anterior' => ['type'=>'VARCHAR','constraint'=>25,'null'=>true],
            'status_novo' => ['type'=>'VARCHAR','constraint'=>25],
            'usuario_id' => ['type'=>'INT','unsigned'=>true],
            'criado_em' => ['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('visita_id');
        $this->forge->addForeignKey('visita_id','visitas','id','RESTRICT','RESTRICT','fk_visita_evento');
        $this->forge->createTable('visita_status_historico',true);

        $now=date('Y-m-d H:i:s');
        foreach(['Lead de anúncio','Indicação','Renovação','Outro'] as $nome) {
            $this->db->table('lead_origens')->insert(['nome'=>$nome,'ativo'=>1,'criado_em'=>$now]);
        }
        foreach(['Preço','Vai pensar','Falta de dinheiro','Não gostou','Outro'] as $descricao) {
            $this->db->table('motivos_nao_venda')->insert(['descricao'=>$descricao,'ativo'=>1,'criado_em'=>$now]);
        }
    }

    public function down()
    {
        $this->forge->dropTable('visita_status_historico',true);
        $this->forge->dropTable('visitas',true);
        $this->forge->dropTable('cliente_corrente_historico',true);
        $this->forge->dropTable('clientes',true);
        $this->forge->dropTable('motivos_nao_venda',true);
        $this->forge->dropTable('lead_origens',true);
    }
}
