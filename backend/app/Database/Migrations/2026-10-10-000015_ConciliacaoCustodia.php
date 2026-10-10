<?php
declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/** Lançamentos explícitos do dinheiro mantido pelo responsável; não altera comissões. */
class ConciliacaoCustodia extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'tipo'=>['type'=>'VARCHAR','constraint'=>20],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'data_movimento'=>['type'=>'DATE'],
            'referencia'=>['type'=>'VARCHAR','constraint'=>100],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500],
            'chave_requisicao'=>['type'=>'VARCHAR','constraint'=>64],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'ATIVO'],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
            'estornado_por_usuario_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'estornado_em'=>['type'=>'DATETIME','null'=>true],
            'motivo_estorno'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['fechamento_id','situacao']);
        $this->forge->addUniqueKey(['fechamento_id','chave_requisicao'],'uq_custodia_requisicao');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_custodia_periodo');
        $this->forge->createTable('fechamento_custodia_movimentos',true);
    }

    public function down()
    {
        $this->forge->dropTable('fechamento_custodia_movimentos',true);
    }
}
