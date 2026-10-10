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
    $routes->get('vendas', 'Api\VendasController::index');
    $routes->get('vendas/(:num)', 'Api\VendasController::detalhe/$1');
    $routes->post('vendas', 'Api\VendasController::create', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/converter', 'Api\VendasController::converter/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/receber', 'Api\VendasController::receber/$1', ['filter'=>'csrf']);
    $routes->post('vendas/(:num)/devolver', 'Api\VendasController::devolver/$1', ['filter'=>'csrf']);
    $routes->post('vendas/regras', 'Api\VendasCatalogosController::regra', ['filter'=>'csrf']);
    $routes->post('vendas/regras/(:num)/editar', 'Api\VendasCatalogosController::regra/$1', ['filter'=>'csrf']);
    $routes->post('vendas/formas', 'Api\VendasCatalogosController::forma', ['filter'=>'csrf']);
    $routes->post('vendas/formas/(:num)/editar', 'Api\VendasCatalogosController::forma/$1', ['filter'=>'csrf']);
});

// Rotas internas do Shield: recuperação de acesso e gestão de sessão tradicional.
// O registro público é desabilitado em Config/Auth.php.
service('auth')->routes($routes);
