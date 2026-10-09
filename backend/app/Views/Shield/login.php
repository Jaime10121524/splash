<?php helper('splash'); ?>
<?= $this->extend(config('Auth')->views['layout']) ?>
<?= $this->section('title') ?>Entrar<?= $this->endSection() ?>
<?= $this->section('main') ?>
<div class="form-heading">
  <p class="eyebrow">BEM-VINDO AO SPLASH</p>
  <h1>Entre na sua conta</h1>
  <p>Acesse seu espaço de trabalho com segurança.</p>
</div>
<?= view('Shield/feedback') ?>
<form method="post" action="<?= url_to('login') ?>" class="form-fields">
  <?= csrf_field() ?>
  <label for="login-username">Nome de usuário</label>
  <div class="field"><span class="field-icon">♙</span><input id="login-username" name="username" type="text" value="<?= esc(old('username')) ?>" autocomplete="username" placeholder="Digite seu usuário" maxlength="100" required autofocus></div>
  <div class="label-between"><label for="login-password">Senha</label><a href="<?= url_to('magic-link') ?>">Esqueceu a senha?</a></div>
  <div class="field"><span class="field-icon">⌘</span><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required></div>
  <button class="button-primary" type="submit">Acessar sistema <span aria-hidden="true">→</span></button>
</form>
<p class="bottom-link"><a href="<?= esc(splash_frontend_url(), 'attr') ?>">Voltar ao aplicativo SPLASH</a></p>
<p class="security-note"><span aria-hidden="true">♢</span> Seu acesso é individual e protegido.</p>
<?= $this->endSection() ?>
