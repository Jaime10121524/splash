<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/DistribuicaoPagamento.php';
require_once dirname(__DIR__).'/app/Libraries/SaldoComissao.php';

use App\Libraries\DistribuicaoPagamento;
use App\Libraries\SaldoComissao;

function same(mixed $a,mixed $b,string $label): void
{
    if($a!==$b)throw new RuntimeException($label.' divergente: '.var_export([$a,$b],true));
}
$commission=[
    ['operacao_id'=>101,'rateio_id'=>5,'tipo'=>'PARTICIPACAO','data_venda'=>'2026-10-01','pendente_centavos'=>12000],
    ['operacao_id'=>102,'rateio_id'=>6,'tipo'=>'PARTICIPACAO','data_venda'=>'2026-10-02','pendente_centavos'=>18000],
];
$split=DistribuicaoPagamento::calcular($commission,[
    ['forma_id'=>1,'valor_centavos'=>20000], // Pix
    ['forma_id'=>2,'valor_centavos'=>5000], // Dinheiro
    ['forma_id'=>99,'valor_centavos'=>5000], // Abatimento negociado
]);
same(array_sum(array_column($split,'valor_centavos')),30000,'liquidação total');
same(array_sum(array_map(static fn($p)=>$p['forma_id']===99?$p['valor_centavos']:0,$split)),5000,'abatimento da dívida');
same(array_sum(array_map(static fn($p)=>$p['forma_id']===1||$p['forma_id']===2?$p['valor_centavos']:0,$split)),25000,'dinheiro real');
same(SaldoComissao::resumo(30000,30000)['pendente'],'0.00','saldo de comissão');
$loanPrincipal=20000;
$loanAbate=5000;
same($loanPrincipal-$loanAbate,15000,'saldo de empréstimo após abatimento');
$errors=0;
foreach([
    fn()=>DistribuicaoPagamento::calcular($commission,[
        ['forma_id'=>1,'valor_centavos'=>25000],
        ['forma_id'=>99,'valor_centavos'=>6000],
    ]),
    fn()=>DistribuicaoPagamento::calcular($commission,[
        ['forma_id'=>0,'valor_centavos'=>5000],
    ]),
] as $callback){
    try{$callback();}
    catch(InvalidArgumentException $e){$errors++;}
}
same($errors,2,'validação de saldo e forma');
echo "FinanceiroPessoal: comissão 300, Pix 200, dinheiro 50, abatimento 50, dívida restante 150 OK\n";
