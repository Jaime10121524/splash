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
});

// Rotas internas do Shield: recuperação de acesso e gestão de sessão tradicional.
// O registro público é desabilitado em Config/Auth.php.
service('auth')->routes($routes);
