<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/RateioRules.php';

use App\Libraries\RateioRules;

$rows=[
 ['origem'=>1,'destino'=>2,'valor'=>15000,'papel'=>'CORRETOR'],
 ['origem'=>1,'destino'=>3,'valor'=>6000,'papel'=>'ATENDENTE'],
 ['origem'=>2,'destino'=>4,'valor'=>2000,'papel'=>'ATENDENTE'],
];
$balance=RateioRules::balances(1,36000,$rows);
$expected=[1=>15000,2=>13000,3=>6000,4=>2000];
foreach($expected as $id=>$value){
 if(($balance[$id]??null)!==$value){
  throw new RuntimeException('Saldo incorreto para pessoa '.$id);
 }
}
$failed=0;
foreach([
  [['origem'=>1,'destino'=>2,'valor'=>36001,'papel'=>'CORRETOR']],
  [['origem'=>2,'destino'=>3,'valor'=>100,'papel'=>'GERENTE']],
  [
    ['origem'=>1,'destino'=>2,'valor'=>100,'papel'=>'CORRETOR'],
    ['origem'=>2,'destino'=>1,'valor'=>100,'papel'=>'CORRETOR'],
  ],
  [
    ['origem'=>1,'destino'=>2,'valor'=>100,'papel'=>'ATENDENTE'],
    ['origem'=>1,'destino'=>2,'valor'=>100,'papel'=>'ATENDENTE'],
  ],
] as $items){
 try{RateioRules::balances(1,36000,$items);}
 catch(InvalidArgumentException $e){$failed++;}
}
if($failed!==4)throw new RuntimeException('Validação deixou passar rateios inválidos.');
echo "RateioRules: saldos, fonte de pagamento, ciclos e duplicidades OK\n";
