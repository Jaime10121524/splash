<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/RelatorioAcertoSemanal.php';

use App\Libraries\RelatorioAcertoSemanal;

$sales=[[
    'id'=>41,'corretor_pessoa_id'=>10,'titular_nome'=>'Marta',
    'numero_titulo'=>'4196','sigla_plano'=>'R/T','data_venda'=>'2026-10-10',
    'comissao_prevista'=>'600.00','comissao_ajustada'=>null,
    'cliente_nome'=>'Cliente protegido',
]];
$rates=[
    ['id'=>1,'operacao_id'=>41,'responsavel_pessoa_id'=>10,
     'beneficiario_pessoa_id'=>20,'beneficiario_nome'=>'James','papel'=>'ATENDENTE','valor'=>'120.00'],
    ['id'=>2,'operacao_id'=>41,'responsavel_pessoa_id'=>10,
     'beneficiario_pessoa_id'=>30,'beneficiario_nome'=>'Helena','papel'=>'GERENTE','valor'=>'120.00'],
];
$ownerMoves=[['operacao_id'=>41,'tipo'=>'PAGAMENTO','valor'=>'200.00','forma_id'=>1]];
$rateMoves=[
    ['rateio_id'=>1,'tipo'=>'PAGAMENTO','valor'=>'100.00','forma_id'=>1],
    ['rateio_id'=>1,'tipo'=>'PAGAMENTO','valor'=>'20.00','forma_id'=>9],
    ['rateio_id'=>2,'tipo'=>'PAGAMENTO','valor'=>'80.00','forma_id'=>1],
    ['rateio_id'=>2,'tipo'=>'ESTORNO','valor'=>'30.00','forma_id'=>1],
];
$report=RelatorioAcertoSemanal::calcular($sales,$rates,$ownerMoves,$rateMoves,9);
$people=[];
foreach($report['pessoas'] as $p)$people[$p['pessoa_id']]=$p;
if($report['bruta']!=='600.00'||count($report['vendas'])!==1)throw new RuntimeException('Bruta ou venda incorreta.');
if($people[10]['resumo']!==[
  'total'=>'360.00','liquidado'=>'200.00','recebido'=>'200.00','abatido'=>'0.00','pendente'=>'160.00',
])throw new RuntimeException('Marta saldo incorreto.');
if($people[20]['resumo']!==[
  'total'=>'120.00','liquidado'=>'120.00','recebido'=>'100.00','abatido'=>'20.00','pendente'=>'0.00',
])throw new RuntimeException('James abatimento não reconciliado.');
if($people[30]['resumo']!==[
  'total'=>'120.00','liquidado'=>'50.00','recebido'=>'50.00','abatido'=>'0.00','pendente'=>'70.00',
])throw new RuntimeException('Helena estorno/saldo incorreto.');
if(array_sum(array_map(static fn($p)=>(int)round((float)$p['resumo']['total']*100),$report['pessoas']))!==60000)
    throw new RuntimeException('Dupla contagem de comissão entre participantes.');
$helena=RelatorioAcertoSemanal::individual($report,30);
$encoded=json_encode($helena,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
foreach(['Marta','James','Cliente protegido','cliente_nome','parte_propria','bruta'] as $forbidden) {
    if(str_contains($encoded,$forbidden))throw new RuntimeException('Vazamento de dados para beneficiária: '.$forbidden);
}
if(count($helena['pessoas'])!==1||$helena['pessoas'][0]['resumo']['pendente']!=='70.00')
    throw new RuntimeException('Filtro por pessoa incorreto.');
if(RelatorioAcertoSemanal::individual($report,999)!==['pessoas'=>[],'vendas'=>[]])
    throw new RuntimeException('Conta sem direito deveria receber lista vazia.');

$controller=file_get_contents(dirname(__DIR__).'/app/Controllers/Api/RelatoriosController.php');
if($controller===false||!str_contains($controller,"where('f.status','CONCLUIDO')")
    ||!str_contains($controller,"where('f.status','CONCLUIDO')") 
    ||!str_contains($controller,"'administrador'=>false")
    ||!str_contains($controller,"RelatorioAcertoSemanal::individual")
    ||!str_contains($controller,"where('user_id',(int)$user->id)")) {
    throw new RuntimeException('Proteção de relatórios por fechamento/usuário ausente.');
}
echo "Relatório semanal: comissões, estorno, abatimento, sigilo e status final OK\n";
