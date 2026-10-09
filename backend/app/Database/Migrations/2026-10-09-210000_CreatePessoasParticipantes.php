<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePessoasParticipantes extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome' => ['type'=>'VARCHAR','constraint'=>160],
            'telefone' => ['type'=>'VARCHAR','constraint'=>25,'null'=>true],
            'email' => ['type'=>'VARCHAR','constraint'=>254,'null'=>true],
            'observacoes' => ['type'=>'TEXT','null'=>true],
            'user_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'ativo' => ['type'=>'TINYINT','constraint'=>1,'default'=>1],
            'criado_em' => ['type'=>'DATETIME'],
            'atualizado_em' => ['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey('user_id', 'uq_pessoas_usuario');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'RESTRICT', 'SET NULL', 'fk_pessoas_usuario');
        $this->forge->createTable('pessoas', true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'pessoa_id' => ['type'=>'INT','unsigned'=>true],
            'papel' => ['type'=>'VARCHAR','constraint'=>20],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addUniqueKey(['pessoa_id','papel'], 'uq_pessoa_papel');
        $this->forge->addForeignKey('pessoa_id', 'pessoas', 'id', 'CASCADE', 'RESTRICT', 'fk_pessoa_papel');
        $this->forge->createTable('pessoa_papeis', true);

        $this->forge->addField([
            'id' => ['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'pessoa_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'usuario_autor_id' => ['type'=>'INT','unsigned'=>true,'null'=>true],
            'acao' => ['type'=>'VARCHAR','constraint'=>32],
            'dados_antes' => ['type'=>'TEXT','null'=>true],
            'dados_depois' => ['type'=>'TEXT','null'=>true],
            'criado_em' => ['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey('pessoa_id');
        $this->forge->createTable('pessoa_auditoria', true);
    }

    public function down()
    {
        $this->forge->dropTable('pessoa_auditoria', true);
        $this->forge->dropTable('pessoa_papeis', true);
        $this->forge->dropTable('pessoas', true);
    }
}
