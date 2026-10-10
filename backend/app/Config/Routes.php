<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */
$routes->get('/', 'Home::index');

// Sessões e autenticação da SPA (mesma origem em produção; proxy /api no Vite local).
$routes->group('api', static function ($routes): void {
    $routes->get('session', 'Api\\SessionController::show');
    $routes->post('session/login', 'Api\\SessionController::login', ['filter' => 'csrf']);
    $routes->post('session/logout', 'Api\\SessionController::logout', ['filter' => 'csrf']);
    // Cadastros comerciais: as autorizações são conferidas também no controller.
    $routes->get('planos', 'Api\PlanosController::index');
    $routes->post('planos', 'Api\PlanosController::create', ['filter' => 'csrf']);
    $routes->post('planos/(:num)/versoes', 'Api\PlanosController::novaVersao/$1', ['filter' => 'csrf']);
    $routes->post('planos/(:num)/versoes/(:num)/status', 'Api\PlanosController::status/$1/$2', ['filter' => 'csrf']);
    $routes->post('planos/(:num)/versoes/(:num)/editar', 'Api\PlanosController::atualizar/$1/$2', ['filter' => 'csrf']);
    $routes->post('planos/(:num)/excluir', 'Api\PlanosController::excluir/$1', ['filter' => 'csrf']);
    // Participantes e contas Shield: sempre validados novamente por permissão no servidor.
    $routes->get('pessoas', 'Api\PessoasController::index');
    $routes->post('pessoas', 'Api\PessoasController::create', ['filter'=>'csrf']);
    $routes->post('pessoas/(:num)/editar', 'Api\PessoasController::update/$1', ['filter'=>'csrf']);
    $routes->get('usuarios', 'Api\UsuariosController::index');
    $routes->post('pessoas/(:num)/acesso', 'Api\UsuariosController::create/$1', ['filter'=>'csrf']);
    $routes->post('pessoas/(:num)/vincular', 'Api\UsuariosController::link/$1', ['filter'=>'csrf']);
    $routes->post('usuarios/(:num)/editar', 'Api\UsuariosController::update/$1', ['filter'=>'csrf']);
    $routes->post('usuarios/(:num)/situacao', 'Api\UsuariosController::state/$1', ['filter'=>'csrf']);
    // Clientes e visitas: dados pessoais liberados SOMENTE na API administrativa.
    $routes->get('comercial/opcoes', 'Api\CatalogosController::index');
    $routes->post('comercial/origens', 'Api\CatalogosController::criarOrigem', ['filter'=>'csrf']);
    $routes->post('comercial/origens/(:num)/editar', 'Api\CatalogosController::editarOrigem/$1', ['filter'=>'csrf']);
    $routes->post('comercial/motivos', 'Api\CatalogosController::criarMotivo', ['filter'=>'csrf']);
    $routes->post('comercial/motivos/(:num)/editar', 'Api\CatalogosController::editarMotivo/$1', ['filter'=>'csrf']);
    $routes->get('clientes', 'Api\ClientesController::index');
    $routes->post('clientes', 'Api\ClientesController::create', ['filter'=>'csrf']);
    $routes->post('clientes/(:num)/editar', 'Api\ClientesController::update/$1', ['filter'=>'csrf']);
    $routes->get('clientes/(:num)/corrente', 'Api\ClientesController::corrente/$1');
    $routes->get('atendimentos', 'Api\VisitasController::index');
    $routes->post('atendimentos/chegada', 'Api\VisitasController::chegada', ['filter'=>'csrf']);
    $routes->post('atendimentos/(:num)/iniciar', 'Api\VisitasController::iniciar/$1', ['filter'=>'csrf']);
    $routes->post('atendimentos/(:num)/finalizar', 'Api\VisitasController::finalizar/$1', ['filter'=>'csrf']);
    $routes->post('atendimentos/(:num)/retomar', 'Api\VisitasController::retomar/$1', ['filter'=>'csrf']);
    $routes->post('atendimentos/(:num)/corretores', 'Api\VisitasController::corretores/$1', ['filter'=>'csrf']);

    // Operações de vendas: títulos e negociações compartilham o mesmo extrato.
    $routes->get('vendas/opcoes', 'Api\VendasController::opcoes');
    $routes->get('vendas/resumo', 'Api\VendasController::resumo');
    $routes->get('vendas', 'Api\VendasController::index');
    $routes->get('vendas/(:num)', 'Api\VendasController::detalhe/$1');
    $routes->post('vendas', 'Api\VendasController::create', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/converter', 'Api\VendasController::converter/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/editar', 'Api\VendasController::editar/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/receber', 'Api\VendasController::receber/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/devolver', 'Api\VendasController::devolver/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/estornar', 'Api\VendasController::estornar/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/ajustar-comissao', 'Api\VendasController::ajustarComissao/$1', ['filter'=>'csrf']);
    $routes->post('vendas/regras', 'Api\VendasCatalogosController::regra', ['filter'=>'csrf']);
    $routes->post('vendas/regras/(:num)/editar', 'Api\VendasCatalogosController::regra/$1', ['filter'=>'csrf']);
    $routes->post('vendas/formas', 'Api\VendasCatalogosController::forma', ['filter'=>'csrf']);
    $routes->post('vendas/formas/(:num)/editar', 'Api\VendasCatalogosController::forma/$1', ['filter'=>'csrf']);
    $routes->post('vendas/aplicacoes/(:segment)', 'Api\VendasCatalogosController::aplicacao/$1', ['filter'=>'csrf']);

    // Apuração individual: rateios, pagamentos manuais e extrato próprio.
    // Contas pessoais. A API resolve a pessoa do usuário, nunca aceita trocar o dono por parâmetro.
    $routes->get('financeiro/pessoal', 'Api\\FinanceiroPessoalController::index');
    $routes->post('financeiro/categorias', 'Api\\FinanceiroPessoalController::cadastrarCategoria', ['filter'=>'csrf']);
    $routes->post('financeiro/despesas', 'Api\\FinanceiroPessoalController::cadastrarDespesa', ['filter'=>'csrf']);
    $routes->post('financeiro/despesas/(:num)/editar', 'Api\\FinanceiroPessoalController::editarDespesa/$1', ['filter'=>'csrf']);
    $routes->post('financeiro/despesas/(:num)/cancelar', 'Api\\FinanceiroPessoalController::cancelarDespesa/$1', ['filter'=>'csrf']);
    $routes->post('financeiro/emprestimos', 'Api\\FinanceiroPessoalController::cadastrarEmprestimo', ['filter'=>'csrf']);
    $routes->post('financeiro/emprestimos/(:num)/editar', 'Api\\FinanceiroPessoalController::editarEmprestimo/$1', ['filter'=>'csrf']);
    $routes->post('financeiro/emprestimos/(:num)/cancelar', 'Api\\FinanceiroPessoalController::cancelarEmprestimo/$1', ['filter'=>'csrf']);

    // Fechamento do período tem escopo próprio e NÃO agrega corretores independentes.
    // Todas as rotas revalidam o responsável associado à sessão Shield.
    $routes->get('fechamentos-periodos/escopos','Api\FechamentosPeriodosController::escopos');
    $routes->post('fechamentos-periodos/vincular','Api\FechamentosPeriodosController::vincular',['filter'=>'csrf']);
    $routes->get('fechamentos-periodos','Api\FechamentosPeriodosController::listar');
    $routes->post('fechamentos-periodos','Api\FechamentosPeriodosController::abrir',['filter'=>'csrf']);
    $routes->get('fechamentos-periodos/(:num)','Api\FechamentosPeriodosController::detalhe/$1');
    $routes->get('fechamentos-periodos/(:num)/auditoria-rateios','Api\\FechamentosPeriodosController::auditoriaRateios/$1');
    $routes->post('fechamentos-periodos/(:num)/receber','Api\FechamentosPeriodosController::receber/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/entradas/(:num)/excluir','Api\FechamentosPeriodosController::excluirEntrada/$1/$2',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/abater','Api\FechamentosPeriodosController::abater/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/abates/(:num)/desfazer','Api\FechamentosPeriodosController::desfazerAbate/$1/$2',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/voltar','Api\FechamentosPeriodosController::voltar/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/avancar','Api\FechamentosPeriodosController::avancar/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/pagar','Api\FechamentosPeriodosController::pagar/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/titular/pagar','Api\FechamentosPeriodosController::pagarTitular/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/titulares/(:num)/estornar','Api\FechamentosPeriodosController::estornarTitular/$1/$2',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/repasses/(:num)/estornar','Api\FechamentosPeriodosController::estornarRepasse/$1/$2',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/concluir','Api\FechamentosPeriodosController::concluir/$1',['filter'=>'csrf']);
    // Conciliação de dinheiro custodiado pelo responsável (não liquida comissões).
    $routes->get('fechamentos-periodos/(:num)/conciliacao','Api\\ConciliacaoCustodiaController::index/$1');
    $routes->post('fechamentos-periodos/(:num)/conciliacao/movimentos','Api\\ConciliacaoCustodiaController::registrar/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/conciliacao/movimentos/(:num)/estornar','Api\\ConciliacaoCustodiaController::estornar/$1/$2',['filter'=>'csrf']);
    // Sugestões de Pix reais, vinculadas somente com confirmação e sem baixas automáticas.
    $routes->get('fechamentos-periodos/(:num)/conciliacao/pix','Api\\PixCustodiaController::listar/$1');
    $routes->post('fechamentos-periodos/(:num)/conciliacao/pix/vincular','Api\\PixCustodiaController::vincular/$1',['filter'=>'csrf']);
    $routes->post('fechamentos-periodos/(:num)/conciliacao/pix/(:num)/desvincular','Api\\PixCustodiaController::desvincular/$1/$2',['filter'=>'csrf']);

    $routes->get('fechamentos/resumo', 'Api\FechamentosController::resumo');
    $routes->get('fechamentos/meu', 'Api\FechamentosController::meu');
    $routes->get('fechamentos/contas', 'Api\FechamentosController::contas');
    $routes->get('fechamentos/formas', 'Api\FechamentosController::formasPagamento');
    $routes->post('fechamentos/pagamentos-lote', 'Api\FechamentosController::pagarEmLote', ['filter'=>'csrf']);
    $routes->post('fechamentos/titular/(:num)/pagar', 'Api\FechamentosController::pagarTitular/$1', ['filter'=>'csrf']);
    $routes->post('fechamentos/titular/movimentos/(:num)/estornar', 'Api\FechamentosController::estornarTitular/$1', ['filter'=>'csrf']);
    $routes->post('fechamentos/sincronizar', 'Api\FechamentosController::sincronizar', ['filter'=>'csrf']);
    $routes->get('fechamentos/politica', 'Api\FechamentosController::politica');
    $routes->post('fechamentos/politica', 'Api\FechamentosController::salvarPolitica', ['filter'=>'csrf']);
    $routes->post('fechamentos/excecoes', 'Api\FechamentosController::salvarExcecao', ['filter'=>'csrf']);
    $routes->post('fechamentos/excecoes/(:num)/excluir', 'Api\FechamentosController::excluirExcecao/$1', ['filter'=>'csrf']);
    $routes->post('fechamentos/feriados', 'Api\FechamentosController::salvarFeriado', ['filter'=>'csrf']);
    $routes->post('fechamentos/operacoes/(:num)/rateios', 'Api\FechamentosController::ratear/$1', ['filter'=>'csrf']);
    $routes->get('fechamentos/rateios/(:num)', 'Api\FechamentosController::extrato/$1');
    $routes->post('fechamentos/rateios/(:num)/pagar', 'Api\FechamentosController::pagar/$1', ['filter'=>'csrf']);
    $routes->post('fechamentos/repasses/(:num)/estornar', 'Api\FechamentosController::estornar/$1', ['filter'=>'csrf']);

});

// Rotas internas do Shield: recuperação de acesso e gestão de sessão tradicional.
// O registro público é desabilitado em Config/Auth.php.
service('auth')->routes($routes);
