<?php
declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Permite renovações do MESMO número/sigla com sequência interna, sem
 * desfazer a unicidade das vendas originais. Cada novo evento é outra venda.
 */
final class TitulosRenovacoesUpgrades extends Migration
{
    public function up()
    {
        $this->forge->addColumn('venda_operacoes', [
            'titulo_sequencia'=>['type'=>'INT','unsigned'=>true,'default'=>0,'after'=>'sigla_plano'],
        ]);
        $this->db->query('ALTER TABLE venda_operacoes DROP INDEX uq_operacao_titulo_sigla');
        $this->db->query('ALTER TABLE venda_operacoes ADD UNIQUE KEY uq_operacao_titulo_sigla_seq (numero_titulo,sigla_plano,titulo_sequencia)');

        $this->forge->addField([
            'id'=>['type'=>'INT','unsigned'=>true,'auto_increment'=>true],
            'operacao_origem_id'=>['type'=>'INT','unsigned'=>true],
            'operacao_nova_id'=>['type'=>'INT','unsigned'=>true],
            'tipo'=>['type'=>'VARCHAR','constraint'=>12],
            'vencimento_anterior'=>['type'=>'DATE'],
            'vencimento_novo'=>['type'=>'DATE'],
            'preco_anterior'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'preco_novo'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'valor_adicional'=>['type'=>'DECIMAL','constraint'=>'15,2'],
            'justificativa'=>['type'=>'VARCHAR','constraint'=>500],
            'criado_por_usuario_id'=>['type'=>'INT','unsigned'=>true],
            'criado_em'=>['type'=>'DATETIME'],
        ]);
        $this->forge->addKey('id',true);
        // Um registro só pode ter um sucessor e uma origem: cadeia linear.
        $this->forge->addUniqueKey('operacao_origem_id','uq_titulo_origem');
        $this->forge->addUniqueKey('operacao_nova_id','uq_titulo_sucessora');
        $this->forge->addForeignKey('operacao_origem_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_titulo_anterior');
        $this->forge->addForeignKey('operacao_nova_id','venda_operacoes','id','RESTRICT','RESTRICT','fk_titulo_novo');
        $this->forge->addForeignKey('criado_por_usuario_id','users','id','RESTRICT','RESTRICT','fk_titulo_usuario');
        $this->forge->createTable('titulo_vinculos',true);
    }

    public function down()
    {
        $this->forge->dropTable('titulo_vinculos',true);
        $this->db->query('ALTER TABLE venda_operacoes DROP INDEX uq_operacao_titulo_sigla_seq');
        $this->db->query('ALTER TABLE venda_operacoes ADD UNIQUE KEY uq_operacao_titulo_sigla (numero_titulo,sigla_plano)');
        $this->forge->dropColumn('venda_operacoes','titulo_sequencia');
    }
}
