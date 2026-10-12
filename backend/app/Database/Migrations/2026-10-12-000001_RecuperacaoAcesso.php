<?php
declare(strict_types=1);

namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;

final class RecuperacaoAcesso extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'BIGINT','unsigned'=>true,'auto_increment'=>true],
            'user_id'=>['type'=>'INT','unsigned'=>true],
            'token_hash'=>['type'=>'CHAR','constraint'=>64],
            'expira_em'=>['type'=>'DATETIME'],
            'usado_em'=>['type'=>'DATETIME','null'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('token_hash');
        $this->forge->addKey(['user_id','expira_em']);
        $this->forge->addForeignKey('user_id','users','id','CASCADE','CASCADE');
        $this->forge->createTable('splash_recuperacao_senha',true);
    }
    public function down() { $this->forge->dropTable('splash_recuperacao_senha',true); }
}
