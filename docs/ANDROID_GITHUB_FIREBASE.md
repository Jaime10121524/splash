# SPLASH — APK Android sem Android Studio, com Firebase

O arquivo [`.github/workflows/android-apk.yml`](../.github/workflows/android-apk.yml) compila um **APK DEBUG de teste** no GitHub Actions (Node 22 + Capacitor 8 + Android API 36), incluindo o plugin `@capacitor/push-notifications`.

O APK **não está pronto para instalação antes de uma execução bem-sucedida do workflow**. O `google-services.json` correto é obrigatório: o workflow falha se não houver configuração Firebase.

## 1. Firebase (uma única vez)

1. Abra <https://console.firebase.google.com/> e crie ou escolha o projeto SPLASH.
2. Em **Configurações do projeto → Seus apps → Adicionar app → Android**, registre o pacote **`br.com.ahritech.splash`**. Mantenha esse identificador igual ao `appId` em `frontend/capacitor.config.ts`.
3. Baixe o arquivo `google-services.json` para seu computador. **Não envie esse arquivo para o GitHub como commit**.
4. No PowerShell, gere o conteúdo Base64 copiável (ajuste o caminho do arquivo):
   ```powershell
   $json = "$env:USERPROFILE\Downloads\google-services.json"
   [Convert]::ToBase64String([IO.File]::ReadAllBytes($json)) | Set-Clipboard
   Write-Host "Google Services copiado como Base64."
   ```
5. Em <https://github.com/Jaime10121524/splash/settings/secrets/actions>, clique em **New repository secret**:
   - Name: `SPLASH_FIREBASE_GOOGLE_SERVICES_B64`
   - Secret: cole o texto Base64 que foi copiado (Ctrl+V).
6. Salve o segredo. **Não compartilhe a conta de serviço privada Firebase nem suas chaves neste chat, no Git ou em mensagens**.

## 2. Compilar e baixar o APK no GitHub

1. Abra <https://github.com/Jaime10121524/splash/actions/workflows/android-apk.yml>.
2. Clique em **Run workflow → main → Run workflow**.
3. Na execução, confira que **Compilar APK Android com Push FCM** ficou verde.
4. Entre na execução concluída e, em **Artifacts**, baixe **`SPLASH-Android-Firebase-debug`**.
5. Extraia o ZIP baixado e instale `app-debug.apk` no Android, autorizando temporariamente a instalação de apps dessa origem quando o aparelho pedir.

**Atenção:** é um APK de testes assinado com chave de debug. Para publicar/atualizar oficialmente ou distribuir por lojas, será necessário assinar um build de release usando uma chave de assinatura controlada e guardada pelo proprietário.

## 3. Habilitar entrega de notificações no backend HostGator

Compilar o APK e configurar o Firebase no aparelho **não ativa o envio**, pois o servidor também precisa de credenciais Firebase:

1. No mesmo projeto Firebase, habilite o **Cloud Messaging API (HTTP v1)** quando necessário e, em **Configurações do projeto → Contas de serviço**, gere uma **nova chave privada** JSON, com controle rigoroso de acesso. Essa chave é distinta de `google-services.json`.
2. Pelo Gerenciador de Arquivos, crie a pasta privada `/home1/jamesn20/splash-backend/secrets/` (fora da raiz pública) e envie a chave renomeada `firebase-service-account.json`. Não a coloque em `splash.ahritech.com.br/`, `public_html/` ou no GitHub.
3. Proteja a pasta e o arquivo com o mínimo de acesso de leitura necessário ao processo PHP (por exemplo, diretório 0700 e arquivo 0600 quando o dono for o mesmo usuário do PHP).
4. No arquivo privado `/home1/jamesn20/splash-backend/.env`, acrescente:
   ```ini
   CI_ENVIRONMENT = production
   SPLASH_CAPACITOR_CORS = true
   SPLASH_FIREBASE_SERVICE_ACCOUNT = '/home1/jamesn20/splash-backend/secrets/firebase-service-account.json'
   ```
5. Se já havia configurações, não duplique as mesmas chaves. Confirme que o certificado HTTPS de `https://splash.ahritech.com.br/api/session` é válido.
6. Entre no app Android, toque em **Ativar notificações Android** e conceda permissão.
7. Teste uma visita registrada e um resultado de visita com o aplicativo aberto e fechado. Verifique que as notificações aparecem **somente para os usuários autorizados**.
8. Para lembretes automáticos de títulos e pendências e reenvios, configure no cPanel um cron executando `spark splash:avisos` a cada 15 minutos com o executável PHP correto da hospedagem. Avisos de visitas já acionam o envio na operação (desde que o Firebase esteja disponível).

As notificações no sino do aplicativo funcionam como histórico, mas a entrega FCM pode falhar devido a configuração, rede, permissão do Android ou execução do servidor. **Não considere o push validado antes do teste no aparelho.**

## Segurança e correções comuns

- **Secret ausente:** o workflow para antes do build e explica qual segredo falta.
- **Pacote Firebase diferente:** o workflow verifica o pacote `br.com.ahritech.splash` e falha se não corresponder ao registro Android do Firebase.
- **Login não entra no APK:** confirme `SPLASH_CAPACITOR_CORS = true` e HTTPS; confira sessão/cookies Cross-Origin, não desative CSRF.
- **Botão de notificações informa que falta Firebase:** o backend não está conseguindo ler a conta de serviço ou o caminho informado não existe.
- **Sem notificações após registrar:** confira permissões do Android, Cloud Messaging API, token do dispositivo, envio do backend e logs privados.
- O aplicativo usa `https://splash.ahritech.com.br` (sem `www`). Escolha um único domínio canônico para autenticação e mantenha certificado e URLs coerentes.
