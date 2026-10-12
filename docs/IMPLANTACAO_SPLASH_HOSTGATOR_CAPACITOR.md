# SPLASH — HostGator compartilhada, Capacitor, alertas e backups

## Estado e restrições

**Os arquivos do GitHub são uma preparação de implantação, não uma publicação já executada.** A autenticação móvel cross-origin e Push precisam ser testados com domínio HTTPS e aparelho reais. Sem domínio/cPanel/Firebase/Android Studio conectados, não é possível garantir APK instalável ou avisos nativos entregues.

- Frontend web: React/Vite estático em HTTPS, sem processo Node em produção.
- Backend: CodeIgniter 4 + Shield em PHP >=8.2; banco privado MySQL/MariaDB.
- Mobile Capacitor: Android/iOS com assets incluídos no aplicativo, **sem server.url externo de produção**. Requisições `/api` usam `VITE_SPLASH_API_ORIGIN`.
- Android Push: Firebase Cloud Messaging HTTP v1 e token cadastrado por usuário. iOS nativo APNs **ainda necessita integração e testes próprios em macOS/Xcode**. Alternativa imediata para iPhone: instalar PWA Safari com Web Push.
- PWA navegador: Web Push/VAPID por HTTPS, configurado separadamente do Firebase Android.
- Notificações e dados financeiros continuam restritos por usuário.

## Pacote HostGator

No Windows, depois de atualizar o Git e instalar Composer/Node, executar na raiz do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\hostgator\preparar-pacote.ps1
```

A saída `deploy/_saida_hostgator` contém **dois ZIPs**.

**SPLASH_PUBLICO.zip** — extrair no *document root* direto do domínio/subdomínio, por exemplo `/home/CONTA/public_html` ou `/home/CONTA/splash_publico`, contendo:
- `index.html`, assets do Vite, `manifest.webmanifest`, `push-sw.js`, `.htaccess`;
- `api/index.php` e `api/.htaccess`, um adaptador mínimo sem credenciais.

**SPLASH_PRIVADO.zip** — extrair **fora do document root**, em `/home/CONTA/splash-backend`, contendo código PHP, `vendor`, `spark`, `writable`. Nunca publicar essa pasta em `public_html`.

O adaptador público `api/index.php` resolve `/home/CONTA/splash-backend` usando `dirname(__DIR__,2)`. Esse modelo exige que o document root seja filho direto de `/home/CONTA`. Se o subdomínio apontar para uma subpasta dentro de `public_html`, altere o caminho no adaptador antes de publicar.

Para atualizar: gere os ZIPs novamente, publique os arquivos de frontend e backend nos diretórios correspondentes e execute apenas `php spark migrate`. NÃO execute `migrate:refresh`, `splash:reset-*`, nem carregue dados de teste em produção.

### Banco, SSL e configurações

No cPanel:
1. Ative SSL/HTTPS e confirme que `https://DOMINIO/api/session` responde como API JSON e não `index.html`. Teste também diretamente uma rota React.
2. Defina versão PHP >=8.2 no domínio. Requisitos Composer incluem `mbstring`, `openssl`, `curl`, `gd`, `fileinfo` para mPDF/Shield/Push.
3. Crie banco e usuário com permissões **somente para esse banco**, e guarde a senha fora do Git.
4. Salve `/home/CONTA/splash-backend/.env` com `CI_ENVIRONMENT = production`, `app.baseURL = 'https://DOMINIO/'`, `database.default.*` e `app.forceGlobalSecureRequests = true`.
5. Verifique permissão de escrita `writable/logs`, `writable/cache`, `writable/session`, `writable/backups` sem conceder 777.
6. Rode `php spark migrate` pela versão correta do PHP e valide login/logout, sessão, CSRF, relatórios, vendas, perfis e fechamentos antes do uso.
7. Confirme que `https://DOMINIO/.env`, `/vendor`, `/writable`, `/splash-backend` não podem ser acessados publicamente.

No seu `.env`, nunca reutilize o banco de desenvolvimento como banco da produção.

### E-mail, Web Push e Firebase

SMTP no backend `.env`: definir `email.protocol = smtp`, `email.SMTPHost`, `email.SMTPUser`, `email.SMTPPass`, `email.SMTPPort`, `email.SMTPCrypto`, e `SPLASH_MAIL_FROM` conforme as credenciais **reais** do e-mail no cPanel. Fazer um teste de recuperação de senha com um endereço válido.

Web Push PWA: definir `SPLASH_VAPID_PUBLIC`, `SPLASH_VAPID_PRIVATE`, `SPLASH_VAPID_SUBJECT`, manter privada a chave privada e solicitar permissão no sino de cada aparelho.

FCM nativo Android:
1. Criar projeto Firebase (plano gratuito quando aplicável) e registrar pacote Android idêntico ao `appId` de `frontend/capacitor.config.ts` (identificador atual é **provisório**).
2. Baixar `google-services.json` e colocar **somente no computador de compilação**, em `frontend/android/app/google-services.json`. Arquivo ignorado pelo Git.
3. Criar uma Service Account para Firebase Messaging e armazenar o JSON **fora do document root** da HostGator, com leitura restrita ao PHP.
4. No backend `.env`: `SPLASH_FIREBASE_SERVICE_ACCOUNT = '/home/CONTA/SECRETS/firebase-service-account.json'`.
5. Testar autenticação FCM e envio para um aparelho Android real, inclusive com o app fechado.

O sistema grava no banco cada aviso e tenta entregar por Web Push e/ou FCM. Se o transporte não estiver configurado, avisos ainda são visíveis no sino. **Não é correto afirmar entrega no celular até completar esses testes.**

### Capacitor Android local — Windows

Requer Node.js suportado pelo Capacitor 8, JDK, Android SDK e Android Studio instalados; Android Studio/SDK para gerar e assinar APK/AAB.

```powershell
cd D:\Ahritech\Sistemas\Web\splash\frontend
npm.cmd install
Copy-Item .env.capacitor.example .env.capacitor.local
# EDITE frontend/.env.capacitor.local com o domínio HTTPS VERDADEIRO
npx.cmd cap add android
npm.cmd run android:prepare
npm.cmd run android:open
```

No Android Studio, configurar keystore de release, App ID real, ícones e `google-services.json`. O Vite já gera o frontend com `--mode capacitor` e a API HTTPS é externa. O build bloqueia URLs de exemplo/localhost.

**Sessões cross-origin:** a API hospedada pode habilitar `SPLASH_CAPACITOR_CORS = true` somente sob HTTPS. O backend passa a aceitar credenciais das origens exatas `https://localhost` (Android) e `capacitor://localhost` (iOS), com cookies HttpOnly/Secure/SameSite=None. HTTPS + CSRF continuam obrigatórios. Validar login, logout e cookies no WebView real: restrições de cookies de terceiros variam por SO/versão. Se o login não funcionar no WebView, **não distribua o APK** até resolver a sessão, em vez de usar credenciais fixas ou desligar CSRF.

### Capacitor iOS

No Mac com Xcode e conta Apple apropriada: `npx cap add ios`, `npm run ios:prepare`, `npm run ios:open`. Para Push APNs nativo é necessário configurar certificados/capabilities e adaptar o envio iOS; a implementação FCM HTTP v1 deste projeto é **somente para tokens Android**. O PWA no Safari pode ser usado antes disso.

## Backups: cron e restauração

O comando privado `php spark splash:backup` salva **tabelas e dados SQL em .sql.gz** no diretório `backend/writable/backups` (não público). Não usa `mysqldump`; executa snapshot consistente para InnoDB. Por padrão mantém 30 dias de cópias locais.

Configuração opcional no `.env`:

```ini
SPLASH_BACKUP_DIR = '/home/CONTA/backups-splash'
SPLASH_BACKUP_KEEP_DAYS = 30
```

**Obrigatório:** copiar diariamente/periodicamente os backups para armazenamento externo ao mesmo serviço de hospedagem (não confiar apenas na pasta local). A exportação guarda estrutura de tabelas e linhas; objetos como triggers, procedures e eventos precisam de verificação/exportação adicional, caso existam. Verifique tamanho, integridade gzip e teste restauração regularmente em **outro banco de homologação**, jamais sobre produção sem plano de recuperação.

No Cron Jobs (cPanel), executar:
- `*/15 * * * *` → `/CAMINHO_PHP /home/CONTA/splash-backend/spark splash:avisos`;
- `30 3 * * *` → `/CAMINHO_PHP /home/CONTA/splash-backend/spark splash:backup`.

Use o caminho exato do PHP da hospedagem; não copie caminhos exemplificativos literalmente. Configure limites de logs, não salve ZIPs ou dados sensíveis no diretório público. Um teste de restauração dos .sql.gz pode ser feito descomprimindo com gzip/7-Zip e importando o SQL num **banco separado**, revisando as permissões antes.

## Alertas e WhatsApp

Menu `Alertas comerciais`: configure prazos de títulos (ex.: 90,60,30,7 dias), antecedência de retorno e tempo de pendência. A regra do cron consulta esses prazos; para recebimento por WhatsApp não foi configurado nenhum envio automático. O botão WhatsApp em Clientes, Vendas e Títulos/Renovações é manual, aparece só se houver telefone brasileiro válido e respeita a permissão das telas de dados pessoais.

Notificações de visita: chegada, atendimento iniciado, retomada, alterações de corretores e resultados (venda, pendência, retorno, sem venda e motivo). Pessoas vinculadas e administrador recebem a notificação sem dados pessoais do associado, preservando as regras de privacidade.

## Checklist antes de publicar

- [ ] Recuperação SMTP testada
- [ ] Backup diário criado, cópia externa e RESTAURAÇÃO de teste concluídos
- [ ] Permissões por conta (admin, mãe, esposa, vendedor, gerente) verificadas
- [ ] PDF mPDF impresso e conferido
- [ ] CSRF, login, cookies seguros e SSL conferidos
- [ ] Notificação de visita concluída e Push Web/Android testados
- [ ] Publicação e API no mesmo domínio testadas
- [ ] App Android testado sem `server.url` e login nativo validado
- [ ] Identificador nativo, ícones e assinatura de release configurados
