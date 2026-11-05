# Splash Next – APK Android e notificações reais

Esta versão usa **React Native / Expo SDK 58**, pacote Android `com.ahritech.splashnext`.
O backend CodeIgniter envia **FCM HTTP v1 diretamente** por `EnvioPushNativoSplash`.
O aplicativo registra um **FCM device token nativo** (não um token Expo Push). Web Push/VAPID do site permanece independente.

## 1. Arquivos distintos do Firebase

1. No Firebase Console, use o projeto Firebase que está configurado no servidor do Splash.
2. Cadastre um aplicativo **Android** com **package `com.ahritech.splashnext`** (precisa ser idêntico ao `mobile/app.json`).
3. Baixe o **`google-services.json`** desse aplicativo Android e guarde em `mobile/google-services.json` no PC. O arquivo fica ignorado no Git.
4. Em produção, a hospedagem PHP usa OUTRO JSON: a **conta de serviço Firebase** com chave privada. Ela deve ficar fora da pasta pública, referenciada por `SPLASH_FIREBASE_SERVICE_ACCOUNT` no `backend/.env`. Nunca a copie para o aplicativo nem para o GitHub.
5. Ambos precisam pertencer ao mesmo projeto Firebase, caso contrário o FCM rejeitará o token por divergência do remetente.

## 2. Atualizar e validar no PowerShell

```powershell
$root='D:\Ahritech\Sistemas\Web\splash'
Set-Location $root
git switch feature/react-native-splash-mobile
if ($LASTEXITCODE -ne 0) { throw 'Falha ao escolher branch' }
git pull --ff-only origin feature/react-native-splash-mobile
if ($LASTEXITCODE -ne 0) { throw 'Falha ao atualizar Git' }
Set-Location "$root\mobile"
npm.cmd install
if ($LASTEXITCODE -ne 0) { throw 'Falha nas dependências' }
npx.cmd expo install --fix
if ($LASTEXITCODE -ne 0) { throw 'Falha no alinhamento SDK' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Erro TypeScript. Não gere APK ainda.' }
```

O arquivo `google-services.json` é necessário para compilar o APK com Firebase.

## 2.1 Testar o APK com servidor HTTP do PC (apenas perfil preview)

O perfil `preview` autoriza explicitamente **somente IP privado de rede local**
(`192.168.x.x`, `10.x.x.x` ou `172.16-31.x.x`). O Android libera
cleartext somente nesse perfil de build. O perfil `production` mantém HTTPS obrigatório.

1. Descubra o IPv4 do PC com `ipconfig`. Por exemplo: `192.168.1.105`.
2. No **Expo > Environment variables > preview**, configure
   `EXPO_PUBLIC_SPLASH_API_URL=http://192.168.1.105:8080` (substitua pelo IP real).
   `EXPO_PUBLIC_SPLASH_ALLOW_LAN_HTTP=true` já está definido automaticamente no
   `mobile/eas.json`; não é necessário cadastrá-lo na tela do Expo.
3. Suba o backend no PC: `cd D:\Ahritech\Sistemas\Web\splash\backend` e
   `php spark serve --host 0.0.0.0 --port 8080`. Deixe esse terminal aberto.
4. No navegador do celular na mesma rede Wi-Fi, confira
   `http://192.168.1.105:8080/api/mobile/ping`. Deve responder com JSON.
5. Gere o APK com o perfil `preview`, instale no celular e faça login com
   **credenciais de teste**, nunca senhas reais.

**Atenção:** HTTP não tem criptografia. Use apenas em rede Wi-Fi privada confiável,
com contas e dados fictícios. O PC precisa estar ligado e com o PHP rodando.
Ao mudar o IPv4 do PC, é preciso compilar outro APK ou atualizar a configuração.
Para produção, use HTTPS.

## 3. EAS Build (APK instalável)

```powershell
Set-Location 'D:\Ahritech\Sistemas\Web\splash\mobile'
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest init
```

Na primeira execução, vincule o projeto à sua conta Expo. Quando solicitado, configure as credenciais de assinatura Android e **preserve-as para atualizações futuras**.

No [painel de ambiente do projeto Expo](https://expo.dev/), **Project settings > Environment variables**, ambiente **preview**:

- `GOOGLE_SERVICES_JSON` → tipo **file**, upload do arquivo `mobile/google-services.json`, visibilidade **secret**;
- `EXPO_PUBLIC_SPLASH_API_URL` → tipo **string**, visibilidade **plaintext**, URL real da API **HTTPS**, por exemplo `https://dominio-exemplo.com`, sem `/api` e sem barra final.

O `app.config.js` já reconhece a variável de arquivo do EAS e o arquivo local para desenvolvimento. A configuração remota é indispensável porque `mobile/.env.local` e `google-services.json` não são enviados ao Git.

Conferir variáveis:

```powershell
npx.cmd eas-cli@latest env:list --environment preview
```

Gerar o APK:

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

O serviço EAS retornará o link do **.apk** para instalar no Android. Nenhum servidor Metro/Expo Go é necessário para usar essa build de teste; a API de produção precisa estar acessível por HTTPS.

## 4. O que ocorre ao abrir o APK

- O app cria os canais Android `splash_avisos` e `splash_venda_paga`.
- Na primeira abertura, pede autorização do Android para **notificações** e, em seguida, **câmera**.
- Os pedidos são independentes e a negativa **não bloqueia o aplicativo**. Sem câmera, QR e fotos tiradas no app ficam indisponíveis, mas cadastro/consulta continuam.
- Após o login, se a notificação estiver autorizada, obtém o token FCM e o cadastra em `POST /api/mobile/notificacoes/dispositivo`, vinculado ao ID autenticado.
- Ao voltar para o primeiro plano ou trocar token, tenta sincronizar. Logout desvincula o aparelho e revoga o token de autenticação.
- Ao tocar numa notificação, abre a central interna de notificações.

Em Android 13+ a permissão de notificações depende da resposta do usuário. Se houver recusa, é possível mudar em **Configurações Android > Aplicativos > Splash Next > Notificações**; o app também oferece link em **Mais**. O sistema operacional pode limitar entrega com bateria agressiva, modo não perturbe ou parada forçada.

## 5. Configurar envio no servidor

No `backend/.env` em produção, configurar:

```env
SPLASH_FIREBASE_SERVICE_ACCOUNT=/home/SEU_USUARIO/private/splash-firebase-service-account.json
```

- O arquivo precisa ser a chave de **service account**, nunca o `google-services.json`.
- Ative a API Firebase Cloud Messaging HTTP v1 no projeto Google Cloud/Firebase.
- Verifique extensões PHP `curl` e `openssl`, saída HTTPS e a tabela `splash_push_nativo_dispositivos` das migrations já existentes.
- Os avisos são criados no banco e enviados diretamente em alguns eventos; o comando `php spark splash:avisos` processa os avisos pendentes. No cPanel, configure cron **a cada minuto** se o plano permitir (ou 5 minutos se for o menor intervalo suportado). Cron de 15 minutos implica potencial espera de até 15 minutos para avisos que não forem enviados imediatamente.

## 6. Teste real

1. Instale o APK no celular, abra-o e permita notificações. Câmera pode ser negada para testar o acesso opcional.
2. Entre com um usuário válido. Tenha conexão com a API HTTPS e serviços Google Play.
3. Abra **Mais > Enviar notificação de teste**. Isso chama a API autenticada, que envia via FCM HTTP v1 ao token ativo desse usuário, sem criar venda fictícia.
4. Verifique o banner e som no Android. Se for recusado pelo servidor, a mensagem mostra o motivo. Se o Firebase aceitar, ainda depende do Android entregar.
5. Para testar com o aplicativo fechado, deixe-o em segundo plano e provoque um evento real do Splash pelo sistema web, ou prepare uma notificação interna para a conta e execute `php spark splash:avisos` no backend.
6. Confira se o mesmo aviso aparece na central do app, sem dados de terceiros, e se tocar nele abre as notificações.

**Não funciona com push remoto no Expo Go Android desde SDK 53.** Use o APK gerado ou uma development build. Nenhum APK foi compilado enquanto não houver as credenciais Expo/Firebase e o ambiente de build configurados.

## Comandos úteis

```powershell
cd D:\Ahritech\Sistemas\Web\splash\backend
php spark splash:avisos
php spark routes
```
