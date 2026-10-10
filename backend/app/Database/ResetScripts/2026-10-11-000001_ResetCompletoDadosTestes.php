<?php
declare(strict_types=1);

namespace App\Database\ResetScripts;

use CodeIgniter\Database\Migration;
use RuntimeException;
use Throwable;

/**
 * RESET COMPLETO DE TESTES — fora de app/Database/Migrations.
 *
 * Apaga todos os dados comerciais e financeiros, inclusive clientes,
 * atendimentos, históricos de visitas, vendas e pendências. Preserva
 * usuários/Shield, pessoas, planos, motivos/origens e regras/configuração.
 *
 * É chamado SOMENTE por spark splash:reset-completo-testes.
 * A execução é transacional e pode ser repetida após novos testes.
 */
final class ResetCompletoDadosTestes extends Migration
{
    private const CONFIRMACAO = 'APAGAR_TODOS_OS_DADOS_DE_TESTE';

    /** Listagem explícita, na ordem de dependências (filhos antes dos pais). */
    public const TABLES = [
        // Conciliação e fechamento (referenciam vendas e movimentos).
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
        // Pagamentos e dívidas (inclusive referências a lote/rateio).
        'financeiro_emprestimo_abates',
        'comissao_titular_movimentos',
        'comissao_repasses',
        'comissao_lotes_pagamento',
        'comissao_rateios_auditoria',
        'comissao_auto_apuracoes',
        'comissao_rateios',
        // Auditoria, cobranças e operações.
        'venda_comissao_ajustes',
        'venda_operacoes_auditoria',
        'venda_recebimentos',
        'financeiro_emprestimos',
        'financeiro_despesas',
        'venda_operacoes',
        // Atendimentos, histórico das sessões, corretores e resultados.
        'visita_corretor_historico',
        'visita_resultados_historico',
        'visita_sessoes',
        'visita_status_historico',
        // Clientes e sua corrente.
        'cliente_corrente_historico',
        'visitas',
        'clientes',
    ];

    public function up()
    {
        if (!is_cli() || ENVIRONMENT !== 'development'
            || getenv('SPLASH_CONFIRM_RESET_COMPLETO') !== self::CONFIRMACAO) {
            throw new RuntimeException('RESET COMPLETO BLOQUEADO: somente CLI local em development com confirmação.');
        }

        if (!in_array(strtolower((string)$this->db->hostname), ['127.0.0.1', 'localhost', '::1'], true)) {
            throw new RuntimeException('RESET COMPLETO BLOQUEADO: o banco de dados deve estar no computador local.');
        }

        foreach (self::TABLES as $table) {
            if (!$this->db->tableExists($table)) {
                throw new RuntimeException('A tabela '.$table.' não existe. Execute as migrations normais antes.');
            }
        }

        // Se alguma tabela desconhecida referenciar nossos dados, aborta ANTES
        // do primeiro DELETE. Não desativar a integridade referencial.
        $mask = implode(',', array_fill(0, count(self::TABLES), '?'));
        $dependencies = $this->db->query(
            'SELECT TABLE_NAME, REFERENCED_TABLE_NAME'
            .' FROM information_schema.KEY_COLUMN_USAGE'
            .' WHERE TABLE_SCHEMA = DATABASE()'
            .' AND REFERENCED_TABLE_NAME IN ('.$mask.')'
            .' AND TABLE_NAME NOT IN ('.$mask.')',
            [...self::TABLES, ...self::TABLES]
        )->getResultArray();

        if ($dependencies) {
            throw new RuntimeException(
                'Reset bloqueado: existem tabelas adicionais dependentes: '
                .implode(', ', array_unique(array_column($dependencies, 'TABLE_NAME')))
            );
        }

        $this->db->transBegin();
        try {
            foreach (self::TABLES as $table) {
                if ($table === 'comissao_repasses'
                    || $table === 'comissao_titular_movimentos') {
                    // Estornos apontam para o pagamento original por ID.
                    $this->db->table($table)->where('tipo', 'ESTORNO')->delete();
                }
                if ($table === 'venda_recebimentos') {
                    // Estornos e devoluções apontam para a entrada original.
                    $this->db->table($table)->whereIn('tipo', ['ESTORNO', 'DEVOLUCAO'])->delete();
                }
                if ($table === 'clientes') {
                    // Indicação de cliente é FK recursiva (ON DELETE RESTRICT).
                    // Quebrar esses vínculos de teste antes de limpar a tabela.
                    $this->db->table('clientes')->update(['indicador_cliente_id' => null]);
                }
                // DELETE é transacional; TRUNCATE causaria commit implícito.
                if (!$this->db->table($table)->emptyTable() || $this->db->transStatus() === false) {
                    throw new RuntimeException('Erro ao esvaziar '.$table.'. Toda a operação será revertida.');
                }
            }
            if ($this->db->transStatus() === false) {
                throw new RuntimeException('Falha de integridade; cancelando reset completo.');
            }
            $this->db->transCommit();
        } catch (Throwable $e) {
            $this->db->transRollback();
            throw $e;
        }
    }

    public function down()
    {
        throw new RuntimeException('Os dados excluídos não podem ser restaurados sem backup.');
    }
}
