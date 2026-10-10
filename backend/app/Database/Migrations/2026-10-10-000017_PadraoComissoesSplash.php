<?php
declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Padrões confirmados: 5% atendimento e gerência, atendimento de 12 meses
 * arredondado a R$60 e adicional à vista de R$10 para atendimento.
 * Não modifica rateios de vendas já apuradas nem pagamentos históricos.
 */
class PadraoComissoesSplash extends Migration
{
    public function up()
    {
        $this->forge->addColumn('comissao_politicas',[
            'atendente_um_ano_valor'=>[
                'type'=>'DECIMAL','constraint'=>'15,2','default'=>'60.00',
            ],
            'adicional_atendente_avista'=>[
                'type'=>'DECIMAL','constraint'=>'15,2','default'=>'10.00',
            ],
        ]);
        // Só converte a configuração inicial antiga (10% útil / 5% demais).
        // Configurações personalizadas não são substituídas silenciosamente.
        $this->db->table('comissao_politicas')
            ->where('id',1)
            ->where('percentual_atendente_dia_util','10.00')
            ->where('percentual_atendente_outros_dias','5.00')
            ->update(['percentual_atendente_dia_util'=>'5.00']);
    }

    public function down()
    {
        $this->forge->dropColumn('comissao_politicas',[
            'atendente_um_ano_valor','adicional_atendente_avista',
        ]);
        // Não restaura 10%: uma configuração posterior pode ter sido salva.
    }
}
