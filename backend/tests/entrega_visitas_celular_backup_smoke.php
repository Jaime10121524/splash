<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);
$get=static function(string $file)use($root):string{
    $text=file_get_contents($root.'/'.$file);
    if($text===false)throw new RuntimeException('Arquivo ausente: '.$file);
    return $text;
};
$visits=$get('backend/app/Controllers/Api/VisitasController.php');
$notices=$get('backend/app/Libraries/VisitasAvisos.php');
$backup=$get('backend/app/Commands/BackupSplashCommand.php');
$native=$get('backend/app/Libraries/EnvioPushNativoSplash.php');
$config=$get('backend/app/Controllers/Api/AlertasComerciaisController.php');
$cron=$get('backend/app/Commands/AvisosSplashCommand.php');
$routes=$get('backend/app/Config/Routes.php');
$dotenv=$get('.gitignore');
$mobile=$get('frontend/capacitor.config.ts');
$client=$get('frontend/src/pages/Clientes.jsx');
$sales=$get('frontend/src/pages/Vendas.jsx');
$titles=$get('frontend/src/pages/Titulos.jsx');
$whatsapp=$get('frontend/src/components/WhatsAppLink.jsx');
$deploy=$get('deploy/hostgator/public_html/api/index.php');
$frontRule=$get('deploy/hostgator/public_html/.htaccess');
foreach(['CHEGADA','INICIADO','RETOMADA','CORRETORES','$status'] as $event){
    if(!str_contains($visits,'VisitasAvisos::registrar')||!str_contains($visits,$event))
        throw new RuntimeException('Avisos de visitas incompletos: '.$event);
}
foreach(['motivo_nao_venda','splash_notificacoes','AvisosSplash::alertaUsuario','RETORNO','VENDA','SEM_VENDA'] as $needle){
    if(!str_contains($notices,$needle))throw new RuntimeException('Detalhes da visita não contemplados: '.$needle);
}
foreach(['splash:backup','START TRANSACTION WITH CONSISTENT SNAPSHOT','realpath(FCPATH)',
    'gzopen','SHOW CREATE TABLE','SELECT * FROM','SPLASH_BACKUP_DIR','SPLASH_BACKUP_KEEP_DAYS'] as $needle){
    if(!str_contains($backup,$needle))throw new RuntimeException('Backup sem proteção: '.$needle);
}
foreach(['firebase.messaging','openssl_sign','CURLOPT_SSL_VERIFYPEER','SPLASH_FIREBASE_SERVICE_ACCOUNT',
    'splash_push_nativo_dispositivos'] as $needle){
    if(!str_contains($native,$needle))throw new RuntimeException('Push nativo incompleto: '.$needle);
}
if(str_contains($mobile,'url:')||!str_contains($mobile,"webDir: 'dist'"))
    throw new RuntimeException('Não usar server.url remoto em build de produção.');
foreach([$client,$sales,$titles] as $file){
    if(!str_contains($file,'<WhatsAppLink'))throw new RuntimeException('Faltou botão WhatsApp.');
}
if(!str_contains($whatsapp,'wa.me/')||!str_contains($whatsapp,"rel=\"noopener noreferrer\""))
    throw new RuntimeException('URL WhatsApp sem proteção.');
if(!str_contains($config,'authorizeAdmin')||!str_contains($cron,'splash_alertas_config'))
    throw new RuntimeException('Alertas não configuráveis ou sem permissão.');
if(!str_contains($routes,'AlertasComerciaisController::salvar')||
   !str_contains($routes,'NotificacoesController::registrarNativo'))
    throw new RuntimeException('Faltam rotas CSRF de notificações/configuração.');
if(!str_contains($deploy,'dirname(__DIR__,2)')||
   !str_contains($frontRule,'RewriteRule ^api'))
    throw new RuntimeException('Publicação HostGator sem isolamento da API.');
if(!str_contains($dotenv,'google-services.json')||!str_contains($dotenv,'/deploy/_saida_hostgator/'))
    throw new RuntimeException('Credenciais Firebase/pacotes não ignorados.');
echo "SPLASH: eventos de visita, WhatsApp, Capacitor, Firebase, alertas, deploy e backup integrados.\n";
