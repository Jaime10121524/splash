<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/app/Libraries/VendaMoney.php';
require_once dirname(__DIR__).'/app/Libraries/MinhasVendasConta.php';

use App\Libraries\MinhasVendasConta;

$base=[
    'id'=>17,'numero_titulo'=>'0123','sigla_plano'=>'R/T',
    'data_venda'=>'2026-10-11','data_vencimento'=>'2027-10-11',
    'corretor_pessoa_id'=>10,'segundo_corretor_pessoa_id'=>20,
    'atendente_pessoa_id'=>30,'atendente_adicional_pessoa_id'=>null,
    'gerente_pessoa_id'=>40,
    'comissao_prevista'=>'400.00','comissao_ajustada'=>null,
];
$split=[
    ['id'=>101,'operacao_id'=>17,'responsavel_pessoa_id'=>10,
        'beneficiario_pessoa_id'=>20,'papel'=>'CORRETOR','valor'=>'100.00'],
    ['id'=>102,'operacao_id'=>17,'responsavel_pessoa_id'=>10,
        'beneficiario_pessoa_id'=>30,'papel'=>'ATENDENTE','valor'=>'60.00'],
    ['id'=>103,'operacao_id'=>17,'responsavel_pessoa_id'=>10,
        'beneficiario_pessoa_id'=>40,'papel'=>'GERENTE','valor'=>'40.00'],
];
$owner=[
    ['id'=>201,'operacao_id'=>17,'tipo'=>'PAGAMENTO','valor'=>'150.00','forma_id'=>1,'data_pagamento'=>'2026-10-11'],
    ['id'=>202,'operacao_id'=>17,'tipo'=>'PAGAMENTO','valor'=>'50.00','forma_id'=>9,'data_pagamento'=>'2026-10-11'],
];
$personalPayments=[
    101=>[
        ['id'=>203,'tipo'=>'PAGAMENTO','valor'=>'100.00','forma_id'=>1,'data_pagamento'=>'2026-10-11'],
        ['id'=>204,'tipo'=>'ESTORNO','valor'=>'15.00','forma_id'=>1,'data_pagamento'=>'2026-10-12'],
    ],
    102=>[['id'=>205,'tipo'=>'PAGAMENTO','valor'=>'20.00','forma_id'=>1,'data_pagamento'=>'2026-10-11']],
];

$own=MinhasVendasConta::minhaParticipacao($base,10,$split,$owner,$personalPayments,'GERADO',true,9);
if($own['direito']!=='200.00'||$own['liquidado']!=='200.00'
    ||$own['recebido']!=='150.00'||$own['abatido']!=='50.00'
    ||$own['pendente']!=='0.00'||$own['situacao']!=='QUITADA'){
    throw new RuntimeException('Parcela própria do titular não conciliada.');
}
$secondary=MinhasVendasConta::minhaParticipacao($base,20,$split,[],$personalPayments,'GERADO',true,9);
if($secondary['direito']!=='100.00'||$secondary['liquidado']!=='85.00'
    ||$secondary['pendente']!=='15.00'||$secondary['situacao']!=='PARCIAL'){
    throw new RuntimeException('Segundo corretor: estorno não refletido em saldo.');
}
$attendant=MinhasVendasConta::minhaParticipacao($base,30,$split,[],$personalPayments,'GERADO',true,9);
if($attendant['direito']!=='60.00'||$attendant['pendente']!=='40.00'
    ||$attendant['situacao']!=='PARCIAL'){
    throw new RuntimeException('Comissão pessoal do vendedor divergente.');
}
$manager=MinhasVendasConta::minhaParticipacao($base,40,$split,[],$personalPayments,'GERADO',true,9);
if($manager['direito']!=='40.00'||$manager['situacao']!=='A_RECEBER'){
    throw new RuntimeException('Comissão de gerência divergente.');
}
$apurar=MinhasVendasConta::minhaParticipacao($base,30,[],[],[],null,true,9);
if($apurar['direito']!==null || $apurar['situacao']!=='A_APURAR'){
    throw new RuntimeException('Não atribua comissão fictícia antes da apuração.');
}
$unpaid=MinhasVendasConta::minhaParticipacao($base,30,$split,[],$personalPayments,'GERADO',false,9);
if($unpaid['direito']!==null){
    throw new RuntimeException('Não antecipar comissão não apurada de cliente inadimplente.');
}
$working=MinhasVendasConta::minhaParticipacao($base,30,$split,[],$personalPayments,'GERADO',true,9,true);
if($working['situacao']!=='EM_APURACAO'||$working['liquidado']!==null
    ||$working['direito']!==null||count($working['movimentos'])!==0){
    throw new RuntimeException('Vazamento de valores de fechamento em andamento.');
}
$customer=[
    ...$base,'cliente_nome'=>'CLIENTE_SUPER_SIGILOSO',
    'cliente_cpf'=>'999.111.333-00','cliente_telefone'=>'(98) 90000-0000',
    'responsavel_nome'=>'OUTRA_PESSOA_SIGILOSA','valor_cobrado'=>'1999.99',
];
$clean=MinhasVendasConta::publico($customer,$secondary,true,null);
$json=json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
foreach(['CLIENTE_SUPER_SIGILOSO','999.111.333-00','(98) 90000-0000',
    'OUTRA_PESSOA_SIGILOSA','1999.99','cliente_id','cliente_nome','valor_cobrado',
    'corretor_pessoa_id','responsavel_nome'] as $private){
    if(str_contains($json,$private)){
        throw new RuntimeException('Dado confidencial na API de minhas vendas: '.$private);
    }
}
if($clean['fechamento_concluido_id']!==null){
    throw new RuntimeException('Fechamento em andamento foi apresentado como concluído.');
}
if($clean['comissao']['pendente']!=='15.00'){
    throw new RuntimeException('Retorno individual alterou o saldo.');
}

$controller=file_get_contents(dirname(__DIR__).'/app/Controllers/Api/MinhasVendasController.php');
$routes=file_get_contents(dirname(__DIR__).'/app/Config/Routes.php');
$app=file_get_contents(dirname(__DIR__,2).'/frontend/src/App.jsx');
if(!$controller||!$routes||!$app
    ||!str_contains($controller,"where('user_id',(int)\$user->id)")
    ||!str_contains($controller,"'ativo',1")
    ||!str_contains($controller,"'sales.own'")
    ||!str_contains($controller,'$this->somenteMinhas($sql,$pessoaId)')
    ||!str_contains($controller,"$this->busca($db,$pessoa)->where('o.id',(int)$id)")
    ||!str_contains($controller,"'status']==='CONCLUIDO'")
    ||!str_contains($controller,'MinhasVendasConta::publico(')
    ||!str_contains($routes,'MinhasVendasController::index')
    ||!str_contains($routes,'MinhasVendasController::detalhe')
    ||!str_contains($app,'<MinhasVendas role={user.role}')){
    throw new RuntimeException('Faltam restrições Shield, ID, status de fechamento ou integração do menu.');
}
echo "Minhas vendas: titular, segundo corretor, vendedor, gerente, estorno, sigilo e fechamento OK\n";
