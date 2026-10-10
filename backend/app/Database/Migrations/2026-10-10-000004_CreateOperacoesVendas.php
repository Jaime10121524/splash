<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Negociação -> venda sem recriar recebimentos; valores históricos congelados.
 * Não cria saldos de comissão distribuída: isso será objeto de apuração posterior.
 */
class CreateOperacoesVendas extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome'=>['type'=>'VARCHAR','constraint'=>80],
            'codigo'=>['type'=>'VARCHAR','constraint'=>25],
            'credito'=>['type'=>'TINYINT','constraint'=>1,'default'=>0],
            'ativo'=>['type'=>'TINYINT','constraint'=>1,'default'=>1],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('codigo','uq_forma_codigo');
        $this->forge->createTable('venda_formas_pagamento',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'nome'=>['type'=>'VARCHAR','constraint'=>100],
            'modalidade'=>['type'=>'VARCHAR','constraint'=>20],
            'numerador'=>['type'=>'INT','unsigned'=>true],
            'denominador'=>['type'=>'INT','unsigned'=>true],
            'desconto_cartao'=>['type'=>'DECIMAL','constraint'=>'6,3','default'=>'0.000'],
            'ativo'=>['type'=>'TINYINT','constraint'=>1,'default'=>1],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->createTable('venda_regras_comissao',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'cliente_id'=>['type'=>'INT','unsigned'=>true],
            'visita_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'plano_versao_id'=>['type'=>'INT','unsigned'=>true],
            'situacao'=>['type'=>'VARCHAR','constraint'=>15],
            'historica'=>['type'=>'TINYINT','constraint'=>1,'default'=>0],
            'numero_titulo'=>['type'=>'CHAR','constraint'=>4,'null'=>true],
            'sigla_plano'=>['type'=>'VARCHAR','constraint'=>40],
            'prazo_meses'=>['type'=>'INT','unsigned'=>true],
            'valor_tabela'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'desconto_corretor'=>['type'=>'DECIMAL','constraint'=>'15,2','default'=>'0.00'],
            'valor_cobrado'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'regra_comissao_id'=>['type'=>'INT','unsigned'=>true],
            'regra_snapshot'=>['type'=>'TEXT'],
            'comissao_prevista'=>['type'=>'DECIMAL','constraint'=>'15,2','null'=>true],
            'observacao_comissao'=>['type'=>'VARCHAR','constraint'=>400,'null'=>true],
            'corretor_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'segundo_corretor_pessoa_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'dono_corrente_pessoa_id'=>['type'=>'INT','unsigned'=>true],
            'atendente_pessoa_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'atendente_adicional_pessoa_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'data_negociacao'=>['type'=>'DATE'],
            'data_venda'=>['type'=>'DATE','null'=>true],
            'data_inicio'=>['type'=>'DATE','null'=>true],
            'data_vencimento'=>['type'=>'DATE','null'=>true],
            'retorno_previsto'=>['type'=>'DATE','null'=>true],
            'observacoes'=>['type'=>'TEXT','null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
            'atualizado_em'=>['type'=>'DATETIME','null'=>true],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addUniqueKey('visita_id','uq_operacao_visita');
        $this->forge->addUniqueKey(['numero_titulo','sigla_plano'],'uq_operacao_titulo_sigla');
        $this->forge->addKey(['situacao','data_negociacao']);
        $this->forge->addForeignKey('cliente_id','clientes','id','RESTRICT','RESTRICT','fk_operacao_cliente');
        $this->forge->addForeignKey('visita_id','visitas','id','RESTRICT','RESTRICT','fk_operacao_visita');
        $this->forge->addForeignKey('plano_versao_id','plano_versoes','id','RESTRICT','RESTRICT','fk_operacao_plano');
        $this->forge->addForeignKey('regra_comissao_id','venda_regras_comissao','id','RESTRICT','RESTRICT','fk_operacao_regra');
        $this->forge->addForeignKey('corretor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_operacao_corretor');
        $this->forge->addForeignKey('segundo_corretor_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_operacao_corretor2');
        $this->forge->addForeignKey('dono_corrente_pessoa_id','pessoas','id','RESTRICT','RESTRICT','fk_operacao_corrente');
        $this->forge->createTable('venda_operacoes',true);

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_id'=>['type'=>'INT','unsigned'=>true],
            'tipo'=>['type'=>'VARCHAR','constraint'=>12],
            'referencia_entrada_id'=>['type'=>'INT','unsigned'=>true,'null'=>true],
            'forma_id'=>['type'=>'INT','unsigned'=>true],
            'detentor'=>['type'=>'VARCHAR','constraint'=>15],
            'valor'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'data_movimento'=>['type'=>'DATE'],
            'observacoes'=>['type'=>'VARCHAR','constraint'=>500,'null'=>true],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        $this->forge->addKey(['operacao_id','tipo']);
        $this->forge->addForeignKey('operacao_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_movimento_operacao');
        $this->forge->addForeignKey('forma_id','venda_formas_pagamento','id','RESTRICT','RESTRICT','fk_movimento_forma');
        $this->forge->addForeignKey('referencia_entrada_id','venda_recebimentos','id','RESTRICT','RESTRICT','fk_movimento_referencia');
        $this->forge->createTable('venda_recebimentos',true);

        foreach([
            ['DINHEIRO','Dinheiro',0],
            ['PIX','Pix',0],
            ['CREDITO','Cartão de crédito',1],
            ['DEBITO','Cartão de débito',0],
            ['TRANSFERENCIA','Transferência',0],
        ] as [$code,$name,$credit]) {
            $this->db->table('venda_formas_pagamento')->insert([
                'codigo'=>$code,'nome'=>$name,'credito'=>$credit,'ativo'=>1,
            ]);
        }
        // Modelos são escolhas, NÃO têm datas históricas inventadas.
        foreach([
            ['À vista atual · 40%','AVISTA',40,100,'0.000'],
            ['À vista antigo · 1/3','AVISTA',1,3,'0.000'],
            ['Cartão · 1/3 menos 8%','CARTAO',1,3,'8.000'],
            ['Misto · 1/3 com 8% do saldo da comissão','MISTO',1,3,'8.000'],
        ] as [$name,$mode,$num,$den,$discount]) {
            $this->db->table('venda_regras_comissao')->insert([
                'nome'=>$name,'modalidade'=>$mode,'numerador'=>$num,
                'denominador'=>$den,'desconto_cartao'=>$discount,'ativo'=>1,
            ]);
        }
    }

    public function down()
    {
        $this->forge->dropTable('venda_recebimentos',true);
        $this->forge->dropTable('venda_operacoes',true);
        $this->forge->dropTable('venda_regras_comissao',true);
        $this->forge->dropTable('venda_formas_pagamento',true);
    }
}
