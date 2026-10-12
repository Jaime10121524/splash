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

// O front controller publico esta em /api/index.php, mas as rotas do
// CodeIgniter incluem o prefixo /api. Ao processar REQUEST_URI, o CI4
// remove automaticamente a parte do caminho que coincide com SCRIPT_NAME.
// Corrige apenas esse caminho virtual para preservar /api/session etc.
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
if (preg_match('~^(.*)/api/index\\.php$~', $scriptName, $matches) === 1) {
    $_SERVER['SCRIPT_NAME'] = ($matches[1] ?: '') . '/index.php';
}

require $entry;
$paths=new Paths();
require $paths->systemDirectory.'/Boot.php';
exit(Boot::bootWeb($paths));
