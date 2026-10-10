<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/PixConferencia.php';

use App\Libraries\PixConferencia;

function assertion(bool $truth,string $context): void
{
    if(!$truth)throw new RuntimeException($context);
}

assertion(PixConferencia::saldo('450.00',[])===45000,'Pix original íntegro.');
assertion(PixConferencia::saldo('450.00',[
    ['tipo'=>'DEVOLUCAO','valor'=>'100.00']
])===35000,'Devolução parcial deve reduzir Pix disponível.');
assertion(PixConferencia::saldo('450.00',[
    ['tipo'=>'DEVOLUCAO','valor'=>'100.00'],
    ['tipo'=>'ESTORNO','valor'=>'150.00'],
])===20000,'Estorno reduz saldo restante, sem gerar entrada.');
assertion(PixConferencia::saldo('450.00',[
    ['tipo'=>'ESTORNO','valor'=>'450.00'],
])===0,'Pix integralmente estornado não pode ser reconciliado.');
assertion(PixConferencia::saldo('450.00',[
    ['tipo'=>'ENTRADA','valor'=>'999.00'],
])===45000,'Uma segunda entrada não é devolução do Pix original.');
assertion(PixConferencia::mesmoValor(30000,30000),'Vincular entrada manual do mesmo valor.');
assertion(!PixConferencia::mesmoValor(30000,20000),'Não vincular valor diferente.');
assertion(!PixConferencia::mesmoValor(0,0),'Pix zerado não pode gerar vínculo.');
try {
    PixConferencia::saldo('150.00',[['tipo'=>'ESTORNO','valor'=>'invalido']]);
    throw new RuntimeException('Valor inválido foi aceito.');
} catch (InvalidArgumentException $expected) {}
echo "Pix conciliacao: 9 verificações OK\n";
