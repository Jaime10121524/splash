<?php
declare(strict_types=1);
namespace App\Database\Migrations;
use CodeIgniter\Database\Migration;

final class AlertasComerciais extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'TINYINT','unsigned'=>true],
            'titulos_dias'=>['type'=>'VARCHAR','constraint'=>80,'default'=>'90,60,30,7'],
            'pendencias_dias'=>['type'=>'INT','unsigned'=>true,'default'=>60],
            'retornos_antecedencia_dias'=>['type'=>'INT','unsigned'=>true,'default'=>1],
            'ativo'=>['type'=>'TINYINT','constraint'=>1,'default'=>1],
            'atualizado_em'=>['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->createTable('splash_alertas_config',true);
        $this->db->table('splash_alertas_config')->insert([
            'id'=>1,'titulos_dias'=>'90,60,30,7',
            'pendencias_dias'=>60,'retornos_antecedencia_dias'=>1,'ativo'=>1,
        ]);
    }
    public function down(){ $this->forge->dropTable('splash_alertas_config',true); }
}
