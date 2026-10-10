<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class OrigemIndicacao extends Migration
{
    public function up()
    {
        $this->forge->addColumn('lead_origens',[
            'permite_indicador'=>['type'=>'TINYINT','constraint'=>1,'default'=>0],
        ]);
        // Mantém origens já cadastradas e identifica o tipo Indicação padrão.
        $this->db->table('lead_origens')->where('nome','Indicação')
            ->update(['permite_indicador'=>1]);
    }

    public function down()
    {
        $this->forge->dropColumn('lead_origens','permite_indicador');
    }
}
