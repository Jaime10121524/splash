<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/app/Libraries/FechamentoConferencia.php';

use App\Libraries\FechamentoConferencia as C;
$check=static function(int $got,int $expected,string $name):void {
    if($got!==$expected)throw new RuntimeException($name.' retornou '.$got.' esperado '.$expected);
};
// Comissões brutas: 1000. Entradas do clube: 600. Pagamentos ao titular
// (400) e abatimentos de empréstimo (100) não são NOVAS entradas do clube.
$check(C::diferencaSemEntradaDoClube(100000,60000),40000,'Não deduzir pagamentos nem abatimentos');
$check(C::diferencaSemEntradaDoClube(100000,100000),0,'Entrada do clube integral');
$check(C::diferencaSemEntradaDoClube(100000,120000),-20000,'Excesso a conciliar');
$check(C::diferencaSemEntradaDoClube(0,0),0,'Período sem vendas');
echo "Conferência de entradas do clube: 4 cenários OK\n";
