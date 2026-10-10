<?php
declare(strict_types=1);

namespace App\Database\ResetScripts;

use CodeIgniter\Database\Migration;
use RuntimeException;
use Throwable;

/**
 * Migração EXTRAORDINÁRIA/DESTRUTIVA, fora de Database/Migrations.
 *
 * NÃO é executada por php spark migrate. Só pode ser chamada explicitamente
 * com a confirmação em variável de ambiente e em ENVIRONMENT=development.
 *
 * Apaga operações de venda, rateios, recebimentos do cliente/clube, despesas,
 * empréstimos, pagamentos, custódia e fechamentos, preservando cadastros,
 * planos, pessoas, usuários, clientes, visitas e parametrização de comissões.
 */
final class ResetarVendasFinanceiroTestes extends Migration
{
    private const CONFIRMACAO='APAGAR_TODAS_AS_VENDAS_E_FINANCEIRO';

    public function up()
    {
        if(!is_cli() || ENVIRONMENT!=='development'
            || getenv('SPLASH_CONFIRM_RESET')!==self::CONFIRMACAO){
            throw new RuntimeException('RESET BLOQUEADO: permitido somente via CLI, em development e com confirmação explícita.');
        }
        $tables=[
            'fechamento_custodia_pix_vinculos',
            'fechamento_custodia_movimentos',
            'fechamento_periodo_eventos',
            'fechamento_periodo_abates',
            'fechamento_periodo_repasses',
            'fechamento_periodo_titulares',
            'fechamento_periodo_entradas',
            'fechamento_periodo_vendas',
            'fechamento_periodo_pessoas',
            'fechamento_periodos',
            'financeiro_emprestimo_abates',
            'comissao_titular_movimentos',
            'comissao_repasses',
            'comissao_lotes_pagamento',
            'comissao_rateios_auditoria',
            'comissao_auto_apuracoes',
            'comissao_rateios',
            'venda_comissao_ajustes',
            'venda_operacoes_auditoria',
            'venda_recebimentos',
            'financeiro_emprestimos',
            'financeiro_despesas',
            'venda_operacoes',
        ];
        foreach($tables as $name){
            if(!$this->db->tableExists($name)){
                throw new RuntimeException('A tabela '.$name.' não existe. Execute antes as migrations normais.');
            }
        }
        // Verifica se outra tabela fora da lista referencia alguma tabela que
        // será esvaziada. Nunca desabilita FOREIGN_KEY_CHECKS globalmente.
        $mask=implode(',',array_fill(0,count($tables),'?'));
        $refs=$this->db->query(
            'SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE'
            .' WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN ('.$mask.')'
            .' AND TABLE_NAME NOT IN ('.$mask.')',
            [...$tables,...$tables]
        )->getResultArray();
        if($refs){
            throw new RuntimeException('RESET BLOQUEADO: outras tabelas dependem dos registros: '
                .implode(', ',array_unique(array_column($refs,'TABLE_NAME'))));
        }
        // Guardar somente IDs das visitas que estão marcadas como VENDA
        // em decorrência de uma operação. Não apaga visitantes/clientes.
        $visits=$this->db->table('venda_operacoes')
            ->select('visita_id')->where('visita_id IS NOT NULL',null,false)
            ->get()->getResultArray();
        $visitIds=array_values(array_unique(array_map('intval',
            array_filter(array_column($visits,'visita_id')))));
        $this->db->transBegin();
        try{
            foreach($tables as $table){
                if($table==='comissao_repasses'){
                    // Tabela com FK recursiva: primeiro os estornos, depois as origens.
                    $this->db->table($table)->where('tipo','ESTORNO')->delete();
                }
                if($table==='venda_recebimentos'){
                    // Entradas só podem ser eliminadas após ESTORNO/DEVOLUCAO.
                    $this->db->table($table)->whereIn('tipo',['ESTORNO','DEVOLUCAO'])->delete();
                }
                if(!$this->db->table($table)->emptyTable()){
                    throw new RuntimeException('Não foi possível limpar '.$table.'.');
                }
                if($this->db->transStatus()===false){
                    throw new RuntimeException('Falha ao esvaziar '.$table.'. Reset revertido.');
                }
            }
            if($visitIds){
                $this->db->table('visitas')->whereIn('id',$visitIds)
                    ->where('status','VENDA')->update([
                        'status'=>'PENDENCIA',
                    ]);
            }
            if($this->db->transStatus()===false){
                throw new RuntimeException('Falha de integridade. Nada deve ser confirmado.');
            }
            $this->db->transCommit();
        }catch(Throwable $e){
            $this->db->transRollback();
            throw $e;
        }
    }

    public function down()
    {
        throw new RuntimeException('Reset irreversível: restaure um backup anterior do banco. Não há rollback de dados.');
    }
}
