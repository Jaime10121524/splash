<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/app/Libraries/FechamentoEscopo.php';
use App\Libraries\FechamentoEscopo;

$vinculos=[
    ['responsavel_pessoa_id'=>1,'corretor_pessoa_id'=>2], // Marta sob James
    ['responsavel_pessoa_id'=>1,'corretor_pessoa_id'=>3], // Helena sob James
];
if(FechamentoEscopo::membros(1,$vinculos)!==[1,2,3])throw new RuntimeException('James deve reunir apenas seus administrados.');
if(FechamentoEscopo::membros(4,$vinculos)!==[4])throw new RuntimeException('Corretor 4 independente foi misturado ao grupo.');
if(FechamentoEscopo::podeIniciar(2,2,false,$vinculos))throw new RuntimeException('Marta delegada não pode abrir outro fechamento.');
if(!FechamentoEscopo::podeIniciar(4,4,false,$vinculos))throw new RuntimeException('Corretor independente não consegue fechar conta própria.');
if(FechamentoEscopo::podeIniciar(4,1,false,$vinculos))throw new RuntimeException('Corretor independente acessou o fechamento de James.');
if(!FechamentoEscopo::podeIniciar(1,1,false,$vinculos))throw new RuntimeException('James não consegue abrir o próprio grupo.');
if(!FechamentoEscopo::podeIniciar(0,4,true,$vinculos))throw new RuntimeException('Admin não consegue supervisionar fechamento independente.');
if(FechamentoEscopo::podeIniciar(0,2,true,$vinculos))throw new RuntimeException('Admin não deve abrir um grupo delegado à parte.');
echo "Escopo de fechamento: 8 verificações de isolamento OK\n";
