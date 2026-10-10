<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/RateioRules.php';
require_once dirname(__DIR__).'/app/Libraries/RateioAutomatico.php';

use App\Libraries\RateioAutomatico;

$policy=[
    'percentual_atendente_dia_util'=>'5.00',
    'percentual_atendente_outros_dias'=>'5.00',
    'percentual_gerente'=>'5.00',
    'divisao_segundo_corretor'=>'50.00',
    'atendente_um_ano_valor'=>'60.00',
    'adicional_atendente_avista'=>'10.00',
];
$sale=[
    'corretor_pessoa_id'=>1,'atendente_pessoa_id'=>2,
    'atendente_adicional_pessoa_id'=>null,'gerente_pessoa_id'=>3,
    'segundo_corretor_pessoa_id'=>null,
    'comissao_prevista'=>'392.00','comissao_ajustada'=>null,
    'valor_tabela'=>'1176.00','duracao_meses'=>12,'data_venda'=>'2026-10-10',
    'regra_snapshot'=>json_encode(['modalidade'=>'AVISTA']),
];
$check=static function(array $op,array $policy,int $atendimento,int $gerencia,string $title): void {
    $actual=RateioAutomatico::propose($op,$policy);
    $a=$actual['rateios'];
    if(count($a)!==2||$a[0]['valor']!==$atendimento||$a[1]['valor']!==$gerencia){
        throw new RuntimeException($title.': '.json_encode($actual));
    }
};

$check($sale,$policy,7000,5880,'Anual à vista: R$60 + bônus R$10, gerente R$58,80');
$sale['regra_snapshot']=json_encode(['modalidade'=>'CARTAO']);
$check($sale,$policy,6000,5880,'Anual cartão: R$60 sem bônus');
$sale['duracao_meses']=24;
$check($sale,$policy,5880,5880,'Dois anos: 5% ambos sem arredondamento anual');
$sale['data_venda']='2026-10-12'; // segunda
$check($sale,$policy,5880,5880,'Dia útil: 5% para atendimento e gerência');
$sale['duracao_meses']=12;
$sale['regra_snapshot']=null;
$check($sale,$policy,6000,5880,'Sem forma conhecida, sem bônus à vista');
$sale['regra_snapshot']=json_encode(['modalidade'=>'AVISTA']);
$sale['_regras_especiais']=[[
    'papel'=>'ATENDENTE','modalidade'=>'AVISTA','tipo_dia'=>'TODOS',
    'tipo_calculo'=>'FIXO','valor'=>'65.00',
]];
$check($sale,$policy,7500,5880,'Exceção por plano prevalece sobre arredondamento e mantém bônus');
$sale['comissao_prevista']='90.00';
$proposed=RateioAutomatico::propose($sale,$policy);
if(($proposed['rateios']??null)!==[] || !str_contains(implode(' ',$proposed['avisos']),'insuficiente')){
    throw new RuntimeException('Comissão insuficiente precisa de revisão manual.');
}
echo "Regras SPLASH 5%, anual e bônus à vista: 7 cenários OK\n";
