<?php

declare(strict_types=1);

// Teste independente de banco e de dependências do CodeIgniter.
require_once dirname(__DIR__) . '/app/Libraries/VendaMoney.php';

use App\Libraries\VendaMoney;

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
echo "VendaMoney: 8 verificações OK" . PHP_EOL;
