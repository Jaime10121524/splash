<?php
declare(strict_types=1);

namespace App\Commands;

use App\Database\ResetScripts\ResetCompletoDadosTestes;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use RuntimeException;
use Throwable;

/**
 * Reset completo para testes locais. Intencionalmente não usa MigrationRunner::force,
 * que faria DOWN numa segunda execução e poderia restaurar dados fictícios.
 */
final class ResetCompletoTestes extends BaseCommand
{
    protected $group = 'SPLASH - Testes';
    protected $name = 'splash:reset-completo-testes';
    protected $description = 'Limpa clientes, atendimentos, vendas, pendências e todo financeiro no banco local.';
    protected $usage = 'splash:reset-completo-testes APAGAR_TODOS_OS_DADOS_DE_TESTE';

    public function run(array $params)
    {
        $phrase = 'APAGAR_TODOS_OS_DADOS_DE_TESTE';

        if (ENVIRONMENT !== 'development' || ($params[0] ?? '') !== $phrase) {
            throw new RuntimeException('Reset bloqueado. Rode no ambiente development com confirmação literal.');
        }
        $db = db_connect();
        if (!in_array(strtolower((string)$db->hostname), ['localhost', '127.0.0.1', '::1'], true)) {
            throw new RuntimeException('Reset bloqueado: banco não está em host local.');
        }

        CLI::write('Banco local: '.$db->database);
        CLI::write('EXCLUSÃO IRREVERSÍVEL: clientes, atendimentos, vendas, pendências, fechamentos e todo financeiro.');
        CLI::write('PRESERVADOS: usuários, pessoas, planos, configurações, regras, categorias, origens e motivos.');

        // A migration fica FORA de app/Database/Migrations e pode ser repetida
        // intencionalmente para cada rodada de testes. Ela não altera schema nem
        // histórico de migrations.
        putenv('SPLASH_CONFIRM_RESET_COMPLETO='.$phrase);
        try {
            // Arquivo de migration nomeado com timestamp não é PSR-4 autoloadable.
            // Carrega-o explicitamente sem registrar o reset no MigrationRunner.
            require_once APPPATH.'Database/ResetScripts/2026-10-11-000001_ResetCompletoDadosTestes.php';
            (new ResetCompletoDadosTestes())->up();
            $failed = [];
            foreach (ResetCompletoDadosTestes::TABLES as $table) {
                $count = $db->table($table)->countAllResults();
                if ($count !== 0) {
                    $failed[] = $table.' ('.$count.')';
                }
            }
            if ($failed) {
                throw new RuntimeException('Reset incompleto. Tabelas com registros: '.implode(', ', $failed));
            }
            CLI::write('RESET COMPLETO EXECUTADO: '.count(ResetCompletoDadosTestes::TABLES).' tabelas de dados zeradas.', 'green');
        } catch (Throwable $e) {
            CLI::error('Falha no reset completo: '.$e->getMessage());
            throw $e;
        } finally {
            putenv('SPLASH_CONFIRM_RESET_COMPLETO');
        }
    }
}
