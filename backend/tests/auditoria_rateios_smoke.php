<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/AuditoriaRateios.php';
use App\Libraries\AuditoriaRateios;

function eqv(mixed $got,mixed $want,string $label): void
{
    if($got!==$want)throw new RuntimeException($label.' obtido '.json_encode($got).' esperado '.json_encode($want));
}
$rateios=[
    ['id'=>1,'responsavel_pessoa_id'=>3,'beneficiario_pessoa_id'=>1,
        'beneficiario_nome'=>'James','papel'=>'ATENDENTE','valor_cent'=>12000,'pago_cent'=>0],
    ['id'=>2,'responsavel_pessoa_id'=>3,'beneficiario_pessoa_id'=>2,
        'beneficiario_nome'=>'Helena','papel'=>'GERENTE','valor_cent'=>12000,'pago_cent'=>12000],
];
$a=AuditoriaRateios::analisar(60000,3,$rateios);
eqv($a['parte_propria_cent'],36000,'Marta mantém comissão própria de 360.');
eqv($a['creditos_financeiro_cent'],60000,'Distribuição fecha exatamente em 600.');
eqv($a['diferenca_cent'],0,'Sem dupla contagem.');
eqv($a['pessoas'][0]['funcao'],'Atendimento','James recebe por atendimento.');
eqv($a['pessoas'][1]['funcao'],'Gerência','Helena recebe por gerência.');
eqv($a['pessoas'][1]['pago_cent'],12000,'Pagamento confirmado é separado da titularidade.');
eqv($a['problemas'],[],'Rateio correto não cria alerta.');
$b=AuditoriaRateios::analisar(60000,3,[...$rateios,[
    'id'=>3,'responsavel_pessoa_id'=>1,'beneficiario_pessoa_id'=>2,
    'beneficiario_nome'=>'Helena','papel'=>'CORRETOR','valor_cent'=>1000,'pago_cent'=>0,
]]);
eqv($b['diferenca_cent'],1000,'Rateio de pagador distinto deve acender divergência.');
if(count($b['problemas'])<1)throw new RuntimeException('Não alertou sobre origem divergente.');
$c=AuditoriaRateios::analisar(60000,3,[[
    'id'=>4,'responsavel_pessoa_id'=>3,'beneficiario_pessoa_id'=>1,
    'beneficiario_nome'=>'James','papel'=>'ATENDENTE','valor_cent'=>65000,'pago_cent'=>0,
]]);
eqv($c['parte_propria_cent'],-5000,'Auditoria preserva problema em vez de corrigir silenciosamente.');
if(count($c['problemas'])<1)throw new RuntimeException('Rateio acima da comissão não identificado.');
$d=AuditoriaRateios::analisar(60000,3,[]);
eqv($d['parte_propria_cent'],60000,'Sem rateio, direito integral permanece com titular.');
eqv($d['diferenca_cent'],0,'Sem rateio não pode duplicar valores.');
echo "Auditoria de comissões por venda: 12 verificações OK\n";
