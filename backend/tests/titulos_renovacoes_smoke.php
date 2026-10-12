<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/VigenciaTitulo.php';

use App\Libraries\VigenciaTitulo;

function check(bool $condition,string $error): void {
    if(!$condition)throw new RuntimeException($error);
}

// Fim de mês, leap-year e soma do prazo atual.
check(VigenciaTitulo::vencimento('2024-01-31',1)==='2024-02-29','Fim de mês bissexto.');
check(VigenciaTitulo::vencimento('2025-01-31',1)==='2025-02-28','Fim de mês normal.');
check(VigenciaTitulo::renovar('2030-10-10','2026-10-11',12)===
    ['inicio'=>'2030-10-10','vencimento'=>'2031-10-10'],'Renovação antes de vencer.');
check(VigenciaTitulo::renovar('2020-10-10','2026-10-11',12)===
    ['inicio'=>'2026-10-11','vencimento'=>'2027-10-11'],'Renovação vencida.');
$upgrade=VigenciaTitulo::upgrade('2026-01-31','2031-01-31',120,'1000.00','1850.00');
check($upgrade===['inicio'=>'2026-01-31','vencimento'=>'2036-01-31','adicional'=>'850.00'],'Upgrade com diferença.');
check(VigenciaTitulo::upgrade('2026-01-31','2040-01-31',120,'1000.00','1850.00')['vencimento']==='2040-01-31',
    'Upgrade não pode reduzir vigência acumulada.');
try{VigenciaTitulo::upgrade('2026-01-31','2031-01-31',120,'1900.00','1850.00');throw new RuntimeException('Aceitou downgrade.');}
catch(InvalidArgumentException $e){/* esperado */}
$existing=[
    ['numero_titulo'=>'1234','sigla_plano'=>'R/T','titulo_sequencia'=>0,'cliente_id'=>1],
    ['numero_titulo'=>'1234','sigla_plano'=>'R/T','titulo_sequencia'=>1,'cliente_id'=>1],
];
check(VigenciaTitulo::sequencia($existing,'1234','R/T',1)===2,'Sequência de títulos.');
try{
    VigenciaTitulo::sequencia($existing,'1234','R/T',2);
    throw new RuntimeException('Aceitou o número de outro cliente.');
}catch(InvalidArgumentException $e){/* esperado */}

$routes=file_get_contents(dirname(__DIR__).'/app/Config/Routes.php');
$source=file_get_contents(dirname(__DIR__).'/app/Controllers/Api/TitulosController.php');
$sales=file_get_contents(dirname(__DIR__).'/app/Controllers/Api/VendasController.php');
$reset=file_get_contents(dirname(__DIR__).'/app/Database/ResetScripts/2026-10-11-000001_ResetCompletoDadosTestes.php');
$migration=file_get_contents(dirname(__DIR__).'/app/Database/Migrations/2026-10-11-000018_TitulosRenovacoesUpgrades.php');
if(!$routes||!$source||!$sales||!$reset||!$migration
    ||!str_contains($source,'SELECT * FROM venda_operacoes WHERE id=? FOR UPDATE')
    ||!str_contains($source,"'titulo_sequencia'=>$sequence")
    ||!str_contains($source,"'operacao_origem_id'=>(int)$id")
    ||!str_contains($source,"'comissao_prevista'=>null")
    ||!str_contains($source,'$this->clienteQuitou(')
    ||!str_contains($source,"'cliente_id'=>(int)$source['cliente_id']")
    ||!str_contains($sales,"where('operacao_origem_id',$id)")
    ||!str_contains($sales,"where('operacao_nova_id',(int)$id)")
    ||!str_contains($routes,'TitulosController::movimentar')
    ||!str_contains($reset,"'titulo_vinculos'")
    ||!str_contains($migration,'uq_titulo_origem')
    ||!str_contains($migration,'uq_operacao_titulo_sigla_seq')){
    throw new RuntimeException('Integração de título/fechamento/ordem de histórico incompleta.');
}
echo "Títulos: 8 cenários de prazos, diferença, identidade e integridade OK\n";
