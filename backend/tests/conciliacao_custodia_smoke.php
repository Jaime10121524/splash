<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/ConciliacaoCaixa.php';

use App\Libraries\ConciliacaoCaixa;

function equalMoney(string $actual,string $expected,string $label): void
{
    if($actual!==$expected)throw new RuntimeException($label.': '.$actual.' != '.$expected);
}

// Exemplo real do grupo: valores recebidos e repasses não são receitas pessoais.
$res=ConciliacaoCaixa::calcular(166208,142448,[]);
equalMoney($res['saldo_conciliado'],'237.60','Caixa central após pagamentos');
equalMoney($res['pagamentos_confirmados'],'1424.48','Pagamento separado');

// Somar Pix antigo documentado e saldo anterior; descontar devolução efetiva ao clube.
$res=ConciliacaoCaixa::calcular(166208,142448,[
    ['tipo'=>'SALDO_ANTERIOR','valor'=>'10.00','situacao'=>'ATIVO'],
    ['tipo'=>'PIX_RETIDO','valor'=>'50.00','situacao'=>'ATIVO'],
    ['tipo'=>'REPASSE_CLUBE','valor'=>'30.00','situacao'=>'ATIVO'],
    ['tipo'=>'PIX_RETIDO','valor'=>'500.00','situacao'=>'ESTORNADO'],
]);
equalMoney($res['saldo_conciliado'],'267.60','Custódia conciliada');
equalMoney($res['pix_retido_informado'],'50.00','Não contar estorno');

// Divergência não gera saldo fictício nem transferência automática.
$res=ConciliacaoCaixa::calcular(10000,15000,[]);
equalMoney($res['saldo_conciliado'],'-50.00','Diferença em aberto');
if(!$res['diferença_a_esclarecer'])throw new RuntimeException('Divergência não sinalizada.');
echo "Conciliação de custódia: 6 verificações OK\n";
