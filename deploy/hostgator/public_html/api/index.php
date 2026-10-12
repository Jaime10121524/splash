<?php
/**
 * Front controller público mínimo da API SPLASH.
 * Instalação prevista:
 *   /home/USUARIO/public_html/api/index.php
 *   /home/USUARIO/splash-backend/{app,public,vendor,writable,...}
 * NUNCA copie .env ou outras pastas privadas para public_html.
 */
declare(strict_types=1);

use CodeIgniter\Boot;
use Config\Paths;

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
