<?= $this->extend(config('Auth')->views['layout']) ?>
<?= $this->section('title') ?>Recuperar acesso<?= $this->endSection() ?>
<?= $this->section('main') ?>
<div class="form-heading">
  <p class="eyebrow">SEGURANÇA DA SUA CONTA</p>
  <span class="headline-icon" aria-hidden="true">✉</span>
  <h1>Recuperar acesso</h1>
  <p>Informe o e-mail cadastrado. Enviaremos um link temporário para acessar sua conta com segurança.</p>
</div>
<?= view('Shield/feedback') ?>
<form action="<?= url_to('magic-link') ?>" method="post" class="form-fields">
  <?= csrf_field() ?>
  <label for="recovery-email">E-mail cadastrado</label>
  <div class="field"><span class="field-icon">@</span><input type="email" name="email" id="recovery-email" inputmode="email" autocomplete="email" maxlength="254" value="<?= esc(old('email')) ?>" placeholder="voce@exemplo.com" required autofocus></div>
  <button class="button-primary" type="submit">Enviar link de acesso <span aria-hidden="true">→</span></button>
</form>
<div class="info-note"><span aria-hidden="true">ⓘ</span><p>O link é de uso único e tem prazo de validade. O envio depende do e-mail estar configurado no sistema.</p></div>
<p class="bottom-link"><a href="<?= esc($appUrl, 'attr') ?>"><span aria-hidden="true">←</span> Voltar ao login</a></p>
<?= $this->endSection() ?>
