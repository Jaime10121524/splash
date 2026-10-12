<?php
declare(strict_types=1);
$root=dirname(__DIR__);
$renderer=file_get_contents($root.'/app/Libraries/PdfRelatorios.php');
$routes=file_get_contents($root.'/app/Config/Routes.php');
$admin=file_get_contents($root.'/app/Controllers/Api/RelatoriosGerenciaisController.php');
$weekly=file_get_contents($root.'/app/Controllers/Api/RelatoriosController.php');
$interface=file_get_contents(dirname($root).'/frontend/src/pages/RelatoriosGerenciais.jsx');
$interfaceWeekly=file_get_contents(dirname($root).'/frontend/src/pages/Relatorios.jsx');
$composer=json_decode((string)file_get_contents($root.'/composer.json'),true,512,JSON_THROW_ON_ERROR);
foreach([
 'relatorios/gerenciais/pdf','relatorios/fechamentos/(:num)/pdf'
] as $route)if(!str_contains($routes,$route))throw new RuntimeException('Rota PDF ausente: '.$route);
if(!str_contains($admin,'$this->index()')||!str_contains($weekly,'$this->acertoSemanal($id)')){
 throw new RuntimeException('PDF não está reutilizando autorização do relatório original.');
}
if(!str_contains($renderer,'new Mpdf(')||!str_contains($renderer,'STRING_RETURN')
 ||!str_contains($renderer,'SetHTMLFooter')||!str_contains($renderer,'report-table')
 ||!isset($composer['require']['mpdf/mpdf'])){
 throw new RuntimeException('Renderizador mPDF incompleto.');
}
if(str_contains($interface,'window.print(')||str_contains($interfaceWeekly,'window.print(')){
 throw new RuntimeException('Impressão antiga do navegador voltou ao fluxo.');
}

if(is_file($root.'/vendor/autoload.php')){
 require_once $root.'/vendor/autoload.php';
 if(class_exists(\Mpdf\Mpdf::class)){
  $acerto=[
   'administrador'=>true,
   'fechamento'=>['id'=>3,'inicio'=>'2026-10-01','fim'=>'2026-10-10',
    'responsavel_nome'=>'James Ribeiro'],
   'resumo'=>['comissoes'=>'831.04','recebido_clube'=>'831.04',
    'pagamentos_periodo'=>'831.04','abatido_dividas'=>'0.00',
    'despesas'=>'0.00','saldo_caixa_registrado'=>'0.00'],
   'pessoas'=>[
    ['nome'=>'Maria Ribeiro','resumo'=>['total'=>'200.64','recebido'=>'200.64',
      'abatido'=>'0.00','pendente'=>'0.00','liquidado'=>'200.64'],
     'itens'=>[['titulo'=>'6561 R/T','papel'=>'TITULAR','data'=>'2026-10-10',
      'valor'=>'200.64','recebido'=>'200.64','abatido'=>'0.00','pendente'=>'0.00']]],
   ],
   'vendas'=>[['titulo'=>'6561 R/T','data'=>'2026-10-10',
     'cliente_nome'=>'Cliente de teste','titular_nome'=>'Maria Ribeiro',
     'bruta'=>'260.64','parte_propria'=>'200.64']],
   'entradas'=>[],'aviso'=>'Demonstrativo gerado para teste.',
  ];
  $fixture=['tipo'=>'VENDAS','inicio'=>'2026-10-01','fim'=>'2026-10-11',
   'linhas'=>[['Data'=>'2026-10-11','Título'=>'6561 R/T','Cliente'=>'Pessoa Teste',
     'Corretor'=>'Maria Ribeiro','Valor da venda'=>'1800.00',
     'Comissão bruta'=>'300.12','Fechamento'=>'CONCLUIDO']]];
  foreach([
    \App\Libraries\PdfRelatorios::acerto($acerto),
    \App\Libraries\PdfRelatorios::gerencial($fixture),
  ] as $pdf){
    if(!str_starts_with($pdf,'%PDF-')||strlen($pdf)<2500)
      throw new RuntimeException('mPDF não gerou um documento PDF válido.');
  }
  echo "mPDF: geração real de acerto semanal e gerencial OK.\n";
 }
}else{
 echo "mPDF: verificação estrutural OK; execute composer update para testar a geração real.\n";
}
