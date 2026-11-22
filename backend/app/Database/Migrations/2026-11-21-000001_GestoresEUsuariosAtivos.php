<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Gestao comercial e independente da custodia em fechamento_responsabilidades.
 * O gestor enxerga a equipe mesmo quando nao recebe uma participacao na venda.
 */
final class GestoresEUsuariosAtivos extends Migration
{
    public function up()
    {
        $this->forge->addColumn('venda_operacoes',[
            'renovacao_externa'=>['type'=>'TINYINT','constraint'=>1,'default'=>0],
        ]);
        $this->forge->addColumn('pessoas', [
            'usa_sistema'=>['type'=>'TINYINT','constraint'=>1,'default'=>0,'after'=>'ativo'],
        ]);
        // Preserva a visibilidade de quem ja tem login.
        $this->db->query('UPDATE pessoas SET usa_sistema=1 WHERE user_id IS NOT NULL');

        $this->forge->addField([
            'corretor_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'gestor_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('corretor_pessoa_id',true);
        $this->forge->addKey('gestor_pessoa_id');
        $this->forge->addForeignKey('corretor_pessoa_id','pessoas','id','CASCADE','RESTRICT','fk_equipe_corretor');
        $this->forge->addForeignKey('gestor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_equipe_gestor');
        $this->forge->createTable('gestor_corretores',true);
    }

    public function down()
    {
        $this->forge->dropTable('gestor_corretores',true);
        $this->forge->dropColumn('venda_operacoes','renovacao_externa');
        $this->forge->dropColumn('pessoas','usa_sistema');
    }
}
