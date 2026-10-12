<?php
declare(strict_types=1);
namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;

final class PushNativoAndroid extends Migration
{
    public function up(){
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'user_id'=>['type'=>'INT','unsigned'=>true],
            'token_hash'=>['type'=>'CHAR','constraint'=>64],
            'token'=>['type'=>'VARCHAR','constraint'=>512],
            'plataforma'=>['type'=>'VARCHAR','constraint'=>10],
            'ativo'=>['type'=>'TINYINT','constraint'=>1,'default'=>1],
            'atualizado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('token_hash');
        $this->forge->addKey('user_id');
        $this->forge->addForeignKey('user_id','users','id','CASCADE','CASCADE');
        $this->forge->createTable('splash_push_nativo_dispositivos',true);
    }
    public function down(){ $this->forge->dropTable('splash_push_nativo_dispositivos',true); }
}
