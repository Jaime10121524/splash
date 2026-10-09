<?php
$errors = session('errors');
$err = session('error');
$message = session('message');
?>
<?php if ($err): ?>
  <div class="notice notice-error" role="alert"><?= esc($err) ?></div>
<?php endif ?>
<?php if ($errors): ?>
  <div class="notice notice-error" role="alert">
    <?php foreach ((array) $errors as $error): ?>
      <div><?= esc((string) $error) ?></div>
    <?php endforeach ?>
  </div>
<?php endif ?>
<?php if ($message): ?>
  <div class="notice notice-success" role="status"><?= esc($message) ?></div>
<?php endif ?>
