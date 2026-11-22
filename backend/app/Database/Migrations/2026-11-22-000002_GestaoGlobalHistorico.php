<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/** Habilitação individual, pelo administrador, para a gestão geral do histórico. */
final class GestaoGlobalHistorico extends Migration
{
    public function up()
    {
        $this->forge->addColumn('pessoas',[
            'gestor_visao_global'=>[
                'type'=>'TINYINT','constraint'=>1,'default'=>0,'null'=>false,
                'after'=>'dono_corrente_padrao_pessoa_id',
            ],
        ]);
    }

    public function down()
    {
        $this->forge->dropColumn('pessoas','gestor_visao_global');
    }
}
