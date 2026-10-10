<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/RateioRules.php';
require_once dirname(__DIR__).'/app/Libraries/RateioAutomatico.php';

use App\Libraries\RateioAutomatico;

$policy=[
    'percentual_atendente_dia_util'=>'10.00',
    'percentual_atendente_outros_dias'=>'5.00',
    'percentual_gerente'=>'5.00',
    'divisao_segundo_corretor'=>'50.00',
];
$op=[
    'comissao_prevista'=>'360.00',
    'comissao_ajustada'=>null,
    'valor_tabela'=>'1200.00',
    'corretor_pessoa_id'=>1,
    'segundo_corretor_pessoa_id'=>2,
    'atendente_pessoa_id'=>3,
    'atendente_adicional_pessoa_id'=>null,
    'gerente_pessoa_id'=>null,
    'data_venda'=>'2026-10-10', // Sábado
];
$proposed=RateioAutomatico::propose($op,$policy);
$rows=$proposed['rateios'];
if(count($rows)!==2 || $rows[0]['destino']!==3 || $rows[0]['valor']!==6000
    ||$rows[1]['destino']!==2 || $rows[1]['valor']!==15000){
    throw new RuntimeException('Fim de semana: esperado 60 para atendente e 150 para segundo corretor.');
}
$op['data_venda']='2026-10-09'; // Sexta útil
$rows=RateioAutomatico::propose($op,$policy)['rateios'];
if($rows[0]['valor']!==12000 || $rows[1]['valor']!==12000){
    throw new RuntimeException('Dia útil: esperado 120 atendente e 120 segundo corretor.');
}
$rows=RateioAutomatico::propose($op,$policy,true)['rateios'];
if($rows[0]['valor']!==6000)throw new RuntimeException('Feriado: deveria usar 5% em vez de 10%.');
$op['atendente_pessoa_id']=1; // A própria corretora atende seu cliente
$op['segundo_corretor_pessoa_id']=null;
if(RateioAutomatico::propose($op,$policy)['rateios']!==[]){
    throw new RuntimeException('Corretora que atende o próprio cliente não deve pagar atendimento a si mesma.');
}
$op['gerente_pessoa_id']=4;
$op['data_venda']='2026-10-10';
$rows=RateioAutomatico::propose($op,$policy)['rateios'];
if(count($rows)!==1 || $rows[0]['papel']!=='GERENTE' || $rows[0]['valor']!==6000){
    throw new RuntimeException('Gerente no fim de semana: esperado 5% = 60.');
}
$op['data_venda']='2026-10-09';
if(RateioAutomatico::propose($op,$policy)['rateios']!==[]){
    throw new RuntimeException('Gerente não recebe em dia útil.');
}
echo "RateioAutomatico: 6 cenários OK\n";
