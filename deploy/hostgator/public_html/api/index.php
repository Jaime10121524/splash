<?php
/**
 * Front controller público mínimo da API SPLASH.
 * Instalação prevista:
 *   /home/USUARIO/public_html/api/index.php
 *   /home/USUARIO/splash-backend/{app,public,vendor,writable,...}
 * NUNCA copie .env ou outras pastas privadas para public_html.
 */
declare(strict_types=1);

// Front controller exclusivamente de producao (HostGator).
// Garante que nenhum CI_ENVIRONMENT=development herdado do servidor exponha
// excecoes, caminhos de arquivos ou detalhes internos ao publico.
defined('ENVIRONMENT') || define('ENVIRONMENT', 'production');

use CodeIgniter\Boot;
use Config\Paths;

// Android Capacitor carrega HTML embarcado sob https://localhost.
// Permitir SOMENTE essa origem (e a origem iOS prevista), com credenciais
// e CSRF ativos. Responder OPTIONS antes do roteamento do CodeIgniter,
// pois as rotas /api/* nao declaram explicitamente o metodo OPTIONS.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (is_string($origin) && in_array($origin, ['https://localhost', 'capacitor://localhost'], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Accept, Content-Type, X-CSRF-TOKEN');
    header('Access-Control-Max-Age: 600');
    header('Vary: Origin');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

$backend=dirname(__DIR__,2).DIRECTORY_SEPARATOR.'splash-backend';
$entry=$backend.'/app/Config/Paths.php';
if(!is_file($entry)){
    http_response_code(503);
    exit('API indisponível. Verifique a instalação privada do SPLASH.');
}
if(version_compare(PHP_VERSION,'8.2','<')){
    http_response_code(503);
    exit('O SPLASH requer PHP 8.2 ou superior.');
}
define('FCPATH',$backend.'/public/');
if(!is_dir(FCPATH)){
    http_response_code(503);
    exit('Backend indisponível.');
}
chdir(FCPATH);

// Este arquivo publico vive em /api/index.php, mas as rotas da API
// possuem o prefixo /api. O CI4 usa SCRIPT_NAME para remover o prefixo comum
// de REQUEST_URI. Algumas hospedagens informam variacoes de SCRIPT_NAME
// apos o rewrite; portanto forca a localizacao virtual na raiz.
// Assim, GET /api/session continua sendo a rota "api/session".
$_SERVER['SCRIPT_NAME'] = '/index.php';

require $entry;
$paths=new Paths();
require $paths->systemDirectory.'/Boot.php';
exit(Boot::bootWeb($paths));
