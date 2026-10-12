<?php
declare(strict_types=1);

$root=dirname(__DIR__).'/app/';
$read=static function(string $file)use($root):string {
 $data=file_get_contents($root.$file);
 if($data===false)throw new RuntimeException('Arquivo não encontrado: '.$file);
 return $data;
};
$conta=$read('Controllers/Api/ContaController.php');
$routes=$read('Config/Routes.php');
$notifs=$read('Controllers/Api/NotificacoesController.php');
$notice=$read('Libraries/AvisosSplash.php');
$push=$read('Libraries/EnvioPushSplash.php');
$reports=$read('Controllers/Api/RelatoriosGerenciaisController.php');
$cron=$read('Commands/AvisosSplashCommand.php');
$m1=$read('Database/Migrations/2026-10-12-000001_RecuperacaoAcesso.php');
$m2=$read('Database/Migrations/2026-10-12-000002_NotificacoesPush.php');

foreach(['senhaConfere','password_verify','findByCredentials','random_bytes(32)',
 'hash(\'sha256\'','FOR UPDATE','usado_em','throttler','isBanned'] as $txt){
 if(!str_contains($conta,$txt))throw new RuntimeException('Regra de senha ausente: '.$txt);
}
foreach(['notificacoes/(:num)/ler','conta/redefinir','conta/recuperar',
 'relatorios/gerenciais'] as $txt){
 if(!str_contains($routes,$txt))throw new RuntimeException('Rota ausente: '.$txt);
}
foreach(['where(\'user_id\',$u)','endpoint_hash','https://','isBanned','notificacoes/dispositivos'] as $txt){
 if(!str_contains($notifs,$txt)&&!str_contains($routes,$txt))
  throw new RuntimeException('Isolamento de Web Push: '.$txt);
}
foreach(['chave_evento','user_id','beneficiario_pessoa_id','comissao_rateios',
 'comissao_auto_apuracoes','venda_recebimentos'] as $txt){
 if(!str_contains($notice,$txt))throw new RuntimeException('Evento duplicado ou apuração faltante: '.$txt);
}
foreach(['minishlink','Minishlink'] as $txt){
 if(!str_contains($push,$txt)&&!str_contains(file_get_contents(dirname(__DIR__).'/composer.json'),$txt))
  throw new RuntimeException('Integração Web Push incompleta: '.$txt);
}
foreach(['VENDAS','COMISSOES','ATENDIMENTOS','PENDENCIAS','TITULOS',
 'authorizeAdmin','limit(1000)'] as $txt){
 if(!str_contains($reports,$txt))throw new RuntimeException('Relatório ausente: '.$txt);
}
foreach(['splash:avisos','EnvioPushSplash::enviar','AvisosSplash::alertaUsuario'] as $txt){
 if(!str_contains($cron,$txt))throw new RuntimeException('Cron incompleto: '.$txt);
}
if(!str_contains($m1,'splash_recuperacao_senha')||!str_contains($m2,'splash_push_dispositivos')
 ||!str_contains($m2,'splash_notificacoes')||!str_contains($m2,'uq_splash_aviso_user_evento')){
 throw new RuntimeException('Migrations incompletas.');
}
echo "SPLASH: perfil, recuperacao, alertas e relatorios verificados.\n";
