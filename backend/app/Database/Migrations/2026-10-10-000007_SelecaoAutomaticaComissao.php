<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * A forma REAL de recebimento define a regra. A operação guarda um snapshot
 * de cada opção vigente na criação, para preservar taxas históricas.
 */
class SelecaoAutomaticaComissao extends Migration
{
    public function up()
    {
        $this->forge->addColumn('venda_operacoes',[
            'regras_automaticas_snapshot'=>['type'=>'TEXT','null'=>true],
        ]);
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'codigo'=>['type'=>'VARCHAR','constraint'=>24],
            'regra_comissao_id'=>['type'=>'INT','unsigned'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('codigo','uq_regra_automatica_codigo');
        $this->forge->addForeignKey('regra_comissao_id','venda_regras_comissao','id','RESTRICT','RESTRICT','fk_regra_automatica');
        $this->forge->createTable('venda_regras_aplicacao',true);

        $rules=$this->db->table('venda_regras_comissao')->orderBy('id','ASC')->get()->getResultArray();
        $match=function(string $mode,int $n,int $d) use($rules): ?int {
            foreach($rules as $rule){
                if($rule['modalidade']===$mode && (int)$rule['numerador']===$n
                    && (int)$rule['denominador']===$d)return (int)$rule['id'];
            }
            return null;
        };
        foreach([
            'AVISTA_ATUAL'=>['AVISTA',40,100],
            'AVISTA_HISTORICA'=>['AVISTA',1,3],
            'CARTAO'=>['CARTAO',1,3],
            'MISTO'=>['MISTO',1,3],
        ] as $code=>[$mode,$num,$den]){
            $ruleId=$match($mode,$num,$den);
            if($ruleId===null){
                // O administrador pode ter personalizado modelos antigos.
                // Não alteramos regras existentes nem deixamos migration parcial.
                $defaults=[
                    'AVISTA_ATUAL'=>['À vista atual · 40%','0.000'],
                    'AVISTA_HISTORICA'=>['À vista antigo · 1/3','0.000'],
                    'CARTAO'=>['Cartão · 1/3 menos 8%','8.000'],
                    'MISTO'=>['Misto · 1/3 com 8% do saldo da comissão','8.000'],
                ];
                $dbRule=$defaults[$code];
                $this->db->table('venda_regras_comissao')->insert([
                    'nome'=>$dbRule[0], 'modalidade'=>$mode,
                    'numerador'=>$num,'denominador'=>$den,
                    'desconto_cartao'=>$dbRule[1], 'ativo'=>1,
                ]);
                $ruleId=(int)$this->db->insertID();
            }
            $this->db->table('venda_regras_aplicacao')->insert([
                'codigo'=>$code,'regra_comissao_id'=>$ruleId,
            ]);
        }
        // Registros anteriores não são alterados silenciosamente.
        // A nova seleção é aplicada quando houver novos recebimentos/estornos.
    }

    public function down()
    {
        $this->forge->dropTable('venda_regras_aplicacao',true);
        $this->forge->dropColumn('venda_operacoes','regras_automaticas_snapshot');
    }
}
