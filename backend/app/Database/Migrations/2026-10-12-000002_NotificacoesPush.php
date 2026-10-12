<?php
declare(strict_types=1);
namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;
final class NotificacoesPush extends Migration
{
 public function up(){
  $this->forge->addField([
   'id'=>['type'=>'BIGINT','unsigned'=>true,'auto_increment'=>true],
   'user_id'=>['type'=>'INT','unsigned'=>true],
   'chave_evento'=>['type'=>'VARCHAR','constraint'=>95],
   'categoria'=>['type'=>'VARCHAR','constraint'=>25],
   'titulo'=>['type'=>'VARCHAR','constraint'=>145],
   'mensagem'=>['type'=>'VARCHAR','constraint'=>450],
   'rota'=>['type'=>'VARCHAR','constraint'=>100],
   'valor_proprio'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
   'lido_em'=>['type'=>'DATETIME','null'=>true],
   'enviado_em'=>['type'=>'DATETIME','null'=>true],
   'tentativas'=>['type'=>'TINYINT','constraint'=>2,'unsigned'=>true,'default'=>0],
   'criado_em'=>['type'=>'DATETIME'],
  ]);
  $this->forge->addKey('id',true);
  $this->forge->addUniqueKey(['user_id','chave_evento'],'uq_splash_aviso_user_evento');
  $this->forge->addKey(['user_id','lido_em']);
  $this->forge->addForeignKey('user_id','users','id','CASCADE','CASCADE');
  $this->forge->createTable('splash_notificacoes',true);
  $this->forge->addField([
   'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
   'user_id'=>['type'=>'INT','unsigned'=>true],
   'endpoint_hash'=>['type'=>'CHAR','constraint'=>64],
   'assinatura_json'=>['type'=>'TEXT'],
   'ativo'=>['type'=>'TINYINT','constraint'=>1,'default'=>1],
   'atualizado_em'=>['type'=>'DATETIME'],
  ]);
  $this->forge->addKey('id',true);
  $this->forge->addUniqueKey('endpoint_hash');
  $this->forge->addKey('user_id');
  $this->forge->addForeignKey('user_id','users','id','CASCADE','CASCADE');
  $this->forge->createTable('splash_push_dispositivos',true);
 }
 public function down(){
  $this->forge->dropTable('splash_push_dispositivos',true);
  $this->forge->dropTable('splash_notificacoes',true);
 }
}
