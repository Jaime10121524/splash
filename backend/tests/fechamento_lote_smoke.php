<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/DistribuicaoPagamento.php';
require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/RateioRules.php';
require_once dirname(__DIR__).'/app/Libraries/RateioAutomatico.php';

use App\Libraries\DistribuicaoPagamento;
use App\Libraries\RateioAutomatico;

$lines=[
    ['operacao_id'=>11,'rateio_id'=>14,'tipo'=>'PARTICIPACAO','data_venda'=>'2026-10-06','pendente_centavos'=>3500],
    ['operacao_id'=>12,'rateio_id'=>15,'tipo'=>'PARTICIPACAO','data_venda'=>'2026-10-08','pendente_centavos'=>2500],
];
$forms=[
    ['forma_id'=>2,'valor_centavos'=>4000],
    ['forma_id'=>1,'valor_centavos'=>2000],
];
$pieces=DistribuicaoPagamento::calcular($lines,$forms);
$expected=[
    ['operacao_id'=>11,'rateio_id'=>14,'tipo'=>'PARTICIPACAO','forma_id'=>2,'valor_centavos'=>3500],
    ['operacao_id'=>12,'rateio_id'=>15,'tipo'=>'PARTICIPACAO','forma_id'=>2,'valor_centavos'=>500],
    ['operacao_id'=>12,'rateio_id'=>15,'tipo'=>'PARTICIPACAO','forma_id'=>1,'valor_centavos'=>2000],
];
if($pieces!==$expected)throw new RuntimeException('Falha na distribuição: R$ 40 Pix + R$ 20 dinheiro em 2 vendas.');
$errors=0;
foreach([
    fn()=>DistribuicaoPagamento::calcular($lines,[['forma_id'=>2,'valor_centavos'=>6001]]),
    fn()=>DistribuicaoPagamento::calcular($lines,[['forma_id'=>2,'valor_centavos'=>0]]),
    fn()=>DistribuicaoPagamento::calcular($lines,[['forma_id'=>0,'valor_centavos'=>500]]),
] as $case){
    try{$case();}catch(InvalidArgumentException $e){$errors++;}
}
if($errors!==3)throw new RuntimeException('Acertos inválidos não foram bloqueados.');
$policy=[
    'percentual_atendente_dia_util'=>'10.00',
    'percentual_atendente_outros_dias'=>'5.00',
    'percentual_gerente'=>'5.00','divisao_segundo_corretor'=>'50.00',
];
$op=[
    'comissao_prevista'=>'470.40','comissao_ajustada'=>null,
    'valor_tabela'=>'1176.00','corretor_pessoa_id'=>1,
    'atendente_pessoa_id'=>3,'atendente_adicional_pessoa_id'=>null,
    'segundo_corretor_pessoa_id'=>null,'gerente_pessoa_id'=>4,
    'data_venda'=>'2026-10-10',
    'regra_snapshot'=>json_encode(['modalidade'=>'AVISTA']),
    '_regras_especiais'=>[
        ['papel'=>'ATENDENTE','modalidade'=>'TODOS','tipo_dia'=>'OUTROS',
            'tipo_calculo'=>'FIXO','valor'=>'60.00'],
        ['papel'=>'ATENDENTE','modalidade'=>'AVISTA','tipo_dia'=>'OUTROS',
            'tipo_calculo'=>'FIXO','valor'=>'65.00'],
        ['papel'=>'GERENTE','modalidade'=>'AVISTA','tipo_dia'=>'OUTROS',
            'tipo_calculo'=>'PERCENTUAL','valor'=>'7.00'],
    ],
];
$rates=RateioAutomatico::propose($op,$policy)['rateios'];
if(count($rates)!==2 || $rates[0]['valor']!==6500 || $rates[1]['valor']!==8232){
    throw new RuntimeException('Exceção à vista: atendente R$65 e gerente 7% falhou.');
}
$op['regra_snapshot']=json_encode(['modalidade'=>'CARTAO']);
$rates=RateioAutomatico::propose($op,$policy)['rateios'];
if($rates[0]['valor']!==6000 || $rates[1]['valor']!==5880){
    throw new RuntimeException('Exceção geral de R$60 e gerente padrão 5% falhou.');
}
echo "FechamentoLote: Pix + dinheiro FIFO, saldo, exceção por plano e modalidade OK\n";
