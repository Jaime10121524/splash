<?php helper('splash'); ?>
<?= $this->extend(config('Auth')->views['layout']) ?>
<?= $this->section('title') ?>Confira seu e-mail<?= $this->endSection() ?>
<?= $this->section('main') ?>
<div class="form-heading">
  <p class="eyebrow">RECUPERAÇÃO DE ACESSO</p>
  <span class="headline-icon" aria-hidden="true">✉</span>
  <h1>Confira seu e-mail</h1>
  <p>Se o endereço estiver cadastrado, você receberá instruções para acessar sua conta.</p>
</div>
<?= view('Shield/feedback') ?>
<div class="info-note"><span aria-hidden="true">ⓘ</span><p>Não recebeu? Verifique a caixa de spam e se o envio de e-mail está configurado no SPLASH.</p></div>
<p class="bottom-link"><a href="<?= esc(splash_frontend_url(), 'attr') ?>"><span aria-hidden="true">←</span> Voltar ao login</a></p>
<?= $this->endSection() ?>
