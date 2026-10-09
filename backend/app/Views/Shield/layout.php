<?php
// As views nativas do Shield também usam esta estrutura visual.
// Usamos o mesmo host do frontend do Vite para compartilhar a sessão de login.
$defaultAppUrl = ENVIRONMENT === 'development' ? 'http://localhost:5173/' : base_url('/');
$appUrl = trim((string) env('SPLASH_FRONTEND_URL', $defaultAppUrl));
if (! filter_var($appUrl, FILTER_VALIDATE_URL) || ! in_array(parse_url($appUrl, PHP_URL_SCHEME), ['http', 'https'], true)) {
    $appUrl = $defaultAppUrl;
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#7861f9">
  <title><?= $this->renderSection('title') ?> · SPLASH</title>
  <link rel="stylesheet" href="<?= base_url('assets/css/splash-auth.css') ?>">
</head>
<body>
  <div class="auth-page">
    <aside class="auth-brand-panel" aria-hidden="true">
      <div class="brand-lockup"><span class="brand-icon">∿</span><span>splash<b>.</b></span></div>
      <div class="auth-brand-message">
        <span class="eyebrow light">UMA EXPERIÊNCIA AHRITECH</span>
        <h2>Mais clareza em cada etapa da sua gestão.</h2>
        <p>Visitas, vendas, comissões e fechamentos. Tudo no seu lugar.</p>
        <div class="capsules"><span>Atendimentos</span><span>Comissões</span><span>Fechamentos</span></div>
      </div>
      <small>Feito para simplificar seu dia a dia.</small>
      <div class="deco-circle one"></div><div class="deco-circle two"></div>
    </aside>
    <main class="auth-content">
      <div class="mobile-brand brand-lockup"><span class="brand-icon">∿</span><span>splash<b>.</b></span></div>
      <div class="auth-main">
        <?= $this->renderSection('main') ?>
      </div>
      <footer>© <?= date('Y') ?> SPLASH · Ahritech</footer>
    </main>
  </div>
</body>
</html>
