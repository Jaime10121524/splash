<?php
declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/** Associa Pix real de uma venda a um valor já custodiado ou a lançamento confirmado. */
class VinculosPixCustodia extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'fechamento_id'=>['type'=>'INT','unsigned'=>true],
            'recebimento_id'=>['type'=>'INT','unsigned'=>true],
            'movimento_custodia_id'=>['type'=>'INT','unsigned'=>true],
            'modo'=>['type'=>'VARCHAR','constraint'=>12],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'chave_requisicao'=>['type'=>'VARCHAR','constraint'=>64],
            'situacao'=>['type'=>'VARCHAR','constraint'=>12,'default'=>'ATIVO'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
            'estornado_por_usuario_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'estornado_em'=>['type'=>'DATETIME','null'=>true],
            'motivo_estorno'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['recebimento_id','situacao']);
        $this->forge->addKey(['movimento_custodia_id','situacao']);
        $this->forge->addUniqueKey(['fechamento_id','chave_requisicao'],'uq_pix_vinculo_req');
        $this->forge->addForeignKey('fechamento_id','fechamento_periodos','id','RESTRICT','RESTRICT','fk_pix_fe');
        $this->forge->addForeignKey('recebimento_id','venda_recebimentos','id','RESTRICT','RESTRICT','fk_pix_receb');
        $this->forge->addForeignKey('movimento_custodia_id','fechamento_custodia_movimentos','id','RESTRICT','RESTRICT','fk_pix_custodia');
        $this->forge->createTable('fechamento_custodia_pix_vinculos',true);
    }

    public function down()
    {
        $this->forge->dropTable('fechamento_custodia_pix_vinculos',true);
    }
}
