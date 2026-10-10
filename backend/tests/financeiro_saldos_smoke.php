<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/SaldoComissao.php';

use App\Libraries\SaldoComissao;

function check(string $label, mixed $actual, mixed $expected): void
{
    if($actual!==$expected){
        throw new RuntimeException($label.': esperado '.var_export($expected,true).' mas veio '.var_export($actual,true));
    }
}
$root=SaldoComissao::titular(47040,5880);
check('Marta: comissão 470,40 menos James 58,80',$root,41160);
$paid=SaldoComissao::pago([
    ['tipo'=>'PAGAMENTO','valor'=>'120.00'],
    ['tipo'=>'PAGAMENTO','valor'=>'20.00'],
    ['tipo'=>'ESTORNO','valor'=>'20.00'],
]);
check('pagamento com estorno corrigido',$paid,12000);
check('saldo Marta',SaldoComissao::resumo($root,$paid),[
    'total'=>'411.60','pago'=>'120.00','pendente'=>'291.60',
]);
check('James após repasse parcial',SaldoComissao::resumo(5880,1000),[
    'total'=>'58.80','pago'=>'10.00','pendente'=>'48.80',
]);
check('James totalmente pago',SaldoComissao::resumo(5880,5880),[
    'total'=>'58.80','pago'=>'58.80','pendente'=>'0.00',
]);
$invalid=0;
foreach([
    fn()=>SaldoComissao::titular(3000,3001),
    fn()=>SaldoComissao::resumo(5880,6000),
    fn()=>SaldoComissao::pago([['tipo'=>'ESTORNO','valor'=>'3.00']]),
    fn()=>SaldoComissao::pago([['tipo'=>'TRANSFERENCIA','valor'=>'3.00']]),
] as $case){
    try{$case();}
    catch(InvalidArgumentException $e){$invalid++;}
}
check('bloqueios de inconsistência',$invalid,4);
echo "SaldoComissao: 9 cenários financeiros OK\n";
