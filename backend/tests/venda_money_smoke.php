<?php

declare(strict_types=1);

// Teste independente de banco e de dependências do CodeIgniter.
require_once dirname(__DIR__) . '/app/Libraries/VendaMoney.php';

require_once dirname(__DIR__) . '/app/Libraries/ComissaoAutomatica.php';

use App\Libraries\VendaMoney;
use App\Libraries\ComissaoAutomatica;

function expectMoney(string $label, string|null $expected, ?string $actual): void
{
    if ($actual !== $expected) {
        fwrite(STDERR, $label . ': esperado ' . var_export($expected, true)
            . ', recebido ' . var_export($actual, true) . PHP_EOL);
        exit(1);
    }
}

$cash = ['numerador'=>40,'denominador'=>100,'desconto_cartao'=>'0.000','modalidade'=>'AVISTA'];
$old = ['numerador'=>1,'denominador'=>3,'desconto_cartao'=>'0.000','modalidade'=>'AVISTA'];
$credit = ['numerador'=>1,'denominador'=>3,'desconto_cartao'=>'8.000','modalidade'=>'CARTAO'];
$mixed = ['numerador'=>1,'denominador'=>3,'desconto_cartao'=>'8.000','modalidade'=>'MISTO'];

expectMoney('avista 40%', '400.00', VendaMoney::estimate($cash,100000,0,0)['valor']);
expectMoney('avista desconto 100', '300.00', VendaMoney::estimate($cash,100000,0,10000)['valor']);
expectMoney('avista antigo 1/3', '333.33', VendaMoney::estimate($old,100000,0,0)['valor']);
expectMoney('cartao 1/3 - 8%', '306.66', VendaMoney::estimate($credit,100000,0,0)['valor']);
expectMoney('misto PIX 200 e credito 800', '322.66', VendaMoney::estimate($mixed,100000,20000,0)['valor']);
expectMoney('misto PIX acima da comissao requer conferência', null,
    VendaMoney::estimate($mixed,100000,50000,0)['valor']);
expectMoney('valores', '200.00', VendaMoney::decimal(VendaMoney::cents('200')));
if (VendaMoney::cents('200,00') !== null || VendaMoney::cents('-2.00') !== null) {
    fwrite(STDERR, "Formato inválido foi aceito." . PHP_EOL);
    exit(1);
}

$rules = [
    'AVISTA_ATUAL' => ['id'=>1,...$cash],
    'AVISTA_HISTORICA' => ['id'=>2,...$old],
    'CARTAO' => ['id'=>3,...$credit],
    'MISTO' => ['id'=>4,...$mixed],
];
$pay = static function (string $type, string $amount, bool $isCredit): array {
    return ['tipo'=>$type,'valor'=>$amount,'credito'=>$isCredit?1:0];
};
$cases=[
    ['PIX integral atual',[$pay('ENTRADA','1000.00',false)],false,'400.00','AVISTA_ATUAL'],
    ['PIX integral histórico',[$pay('ENTRADA','1000.00',false)],true,'333.33','AVISTA_HISTORICA'],
    ['Crédito integral',[$pay('ENTRADA','1000.00',true)],false,'306.66','CARTAO'],
    ['Misto 200 pix e 800 cartão',[
        $pay('ENTRADA','200.00',false),$pay('ENTRADA','800.00',true)
    ],false,'322.66','MISTO'],
    ['Pix 360 e crédito 816 no plano 1176',[
        $pay('ENTRADA','360.00',false),$pay('ENTRADA','816.00',true)
    ],false,'389.44','MISTO'],
    ['Pagamento parcial',[$pay('ENTRADA','200.00',false)],false,null,null],
    ['Estorno integral',[
        $pay('ENTRADA','1000.00',false),$pay('ESTORNO','1000.00',false)
    ],false,null,null],
];
foreach($cases as [$label,$movements,$historical,$expected,$code]){
    $total=str_contains($label,'1176')?117600:100000;
    $actual=ComissaoAutomatica::calculate($rules,$movements,$total,$total,0,$historical);
    expectMoney($label,$expected,$actual['valor']);
    if($actual['code']!==$code){
        fwrite(STDERR,$label.' modalidade incorreta: '.var_export($actual['code'],true).PHP_EOL);
        exit(1);
    }
}
echo "ComissaoAutomatica: ".count($cases)." cenários OK" . PHP_EOL;
echo "VendaMoney: 8 verificações OK" . PHP_EOL;
