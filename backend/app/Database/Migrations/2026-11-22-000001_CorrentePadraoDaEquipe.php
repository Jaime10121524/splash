<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * A corrente padrao e configurada por participante, sem depender de
 * gerencia comercial ou do responsavel que recebe repasses.
 * Exemplo: James, Helena e Marta podem apontar todos para James.
 */
final class CorrentePadraoDaEquipe extends Migration
{
    public function up()
    {
        $this->forge->addColumn('pessoas',[
            'dono_corrente_padrao_pessoa_id'=>[
                'type'=>'INT','unsigned'=>true,'null'=>true,'default'=>null,
                'after'=>'usa_sistema',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('pessoas','dono_corrente_padrao_pessoa_id');
    }
}
