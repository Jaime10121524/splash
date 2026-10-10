<?php
declare(strict_types=1);

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Throwable;

/**
 * EXCLUSIVO de ambiente local para reiniciar dados de teste uma única vez.
 * Nunca registra este reset na sequência normal de php spark migrate.
 */
final class ResetTestData extends BaseCommand
{
    protected $group='SPLASH - Testes';
    protected $name='splash:reset-test-data';
    protected $description='Apaga vendas, fechamentos e financeiro somente no ambiente development, com confirmação.';
    protected $usage='splash:reset-test-data APAGAR_TODAS_AS_VENDAS_E_FINANCEIRO';

    public function run(array $params)
    {
        $confirmation='APAGAR_TODAS_AS_VENDAS_E_FINANCEIRO';
        if(ENVIRONMENT!=='development' || ($params[0]??'')!==$confirmation){
            CLI::error('RESET BLOQUEADO. É necessário ambiente development e confirmação literal.');
            CLI::write('Uso: php spark splash:reset-test-data '.$confirmation);
            return;
        }
        $db=db_connect();
        if(!in_array(strtolower((string)$db->hostname),['localhost','127.0.0.1','::1'],true)){
            CLI::error('RESET BLOQUEADO: o banco de dados não está em host local.');
            return;
        }
        if($db->table('migrations')->like('class','ResetarVendasFinanceiroTestes')->countAllResults()>0){
            CLI::error('Esta migração de reset já foi executada. NÃO execute novamente: restaure um backup ou use uma base de testes nova.');
            return;
        }
        CLI::write('ATENÇÃO: exclusão IRREVERSÍVEL de vendas, recebimentos, comissões,');
        CLI::write('fechamentos, despesas e empréstimos do banco: '.$db->database);
        CLI::write('Cadastros, clientes, planos, usuários e configurações serão preservados.');
        CLI::write('É obrigatório possuir BACKUP antes desta operação.');
        $path=APPPATH.'Database/ResetScripts/2026-10-10-235959_ResetarVendasFinanceiroTestes.php';
        putenv('SPLASH_CONFIRM_RESET='.$confirmation);
        try{
            $success=service('migrations')->force($path,'App');
            if(!$success)throw new \RuntimeException('Migration extraordinária não pôde ser concluída.');
            foreach(['venda_operacoes','venda_recebimentos','comissao_rateios',
                'comissao_repasses','fechamento_periodos','financeiro_despesas',
                'financeiro_emprestimos'] as $table){
                $total=$db->table($table)->countAllResults();
                CLI::write($table.': '.$total.' registro(s)');
                if($total!==0)throw new \RuntimeException('Verificação final falhou em '.$table.'.');
            }
            CLI::write('RESET EXECUTADO E CONTAGENS ZERADAS.', 'green');
        }catch(Throwable $error){
            CLI::error('RESET NÃO CONCLUÍDO: '.$error->getMessage());
            CLI::write('Não execute o reset novamente sem verificar os logs e fazer backup.');
            throw $error;
        }finally{
            putenv('SPLASH_CONFIRM_RESET');
        }
    }
}
