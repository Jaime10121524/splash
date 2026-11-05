# Splash Next — implantação e Financeiro — 05/11/2026

**Branch de referência:** `feature/react-native-splash-mobile`.

## Visão geral

Esta entrega introduz no **APK 0.2.2**:
- prevenção do ciclo de aquisição/registro FCM, intervalo de 15 minutos
  para sincronização normal, exclusão de chamadas concorrentes e
  idempotência/limite de tentativas no backend;
- tela `Financeiro` por intervalo, que utiliza a mesma apuração do módulo
  financeiro web, sem duplicar lançamento ou regra de comissões;
- admin: a pagar aos outros participantes, próprias a receber e recebidas,
  pagas à equipe, valores discriminados por pessoa;
- gerente, corretor e vendedor: exclusivamente a própria conta;
- operador: sem acesso à API financeira;
- perfil `production-apk` com HTTPS obrigatório.

**Não há migração nova para esses dois ajustes** (Financeiro mobile e loop FCM).
Porém, a branch inteira acrescenta três migrations novas desde `main`,
listadas abaixo. Precisam estar instaladas antes de publicar todos os
endpoints e telas da branch.

## O que vai à HostGator

Use o empacotador já existente para evitar esquecer arquivos do backend:

```powershell
$root='D:\Ahritech\Sistemas\Web\splash'
Set-Location $root
# Se houver alterações locais em app.json ou package.json, guardá-las
# antes do pull; o google-services.json ignorado NÃO é removido:
git stash push -m 'Backup Expo antes do deploy' -- mobile/app.json mobile/package.json
git pull --ff-only origin feature/react-native-splash-mobile
if($LASTEXITCODE -ne 0){throw 'Falha no Git'}
Set-Location "$root\frontend"
npm.cmd install
if($LASTEXITCODE -ne 0){throw 'Falha npm web'}
Set-Location "$root\mobile"
npm.cmd install
if($LASTEXITCODE -ne 0){throw 'Falha npm mobile'}
npm.cmd run typecheck
if($LASTEXITCODE -ne 0){throw 'Falha TypeScript'}
Set-Location $root
powershell.exe -ExecutionPolicy Bypass -File '.\deploy\hostgator\preparar-pacote.ps1'
if($LASTEXITCODE -ne 0){throw 'Falha no pacote HostGator'}
```

O script produz:
- `deploy/_saida_hostgator/SPLASH_PUBLICO.zip` — arquivos React/Vite
  compilados, `.htaccess` e ponte `api/`, para o document root do domínio;
- `deploy/_saida_hostgator/SPLASH_PRIVADO.zip` — backend PHP, `vendor`,
  controllers, bibliotecas e migrations, para `/home/CONTA/splash-backend`,
  **fora** de `public_html`.

**Nunca** envie `SPLASH_PRIVADO.zip` ou `backend/.env` para a pasta pública.
O empacotador não inclui o `.env`; preserve o arquivo existente no servidor.
Preserve também `writable` e imagens carregadas pelos usuários.

### Arquivos backend modificados desde main

Os dois ZIPs são a forma recomendada de não perder dependências,
mas, para conferência, são os arquivos de `backend/app` modificados ou
adicionados nesta branch em relação ao `main`:

```text
Config/AuthGroups.php
Config/Routes.php
Controllers/Api/AgendamentosController.php
Controllers/Api/BonificacoesController.php
Controllers/Api/CatalogosController.php
Controllers/Api/ClientesController.php
Controllers/Api/FechamentosController.php
Controllers/Api/GestorVendasController.php
Controllers/Api/MidiasSplashController.php
Controllers/Api/MinhasVendasController.php
Controllers/Api/MobileClientesController.php
Controllers/Api/MobileContaController.php
Controllers/Api/MobileController.php
Controllers/Api/MobileDashboardController.php
Controllers/Api/MobileNotificacoesController.php
Controllers/Api/MobileRateiosController.php
Controllers/Api/MobileVendasController.php
Controllers/Api/MobileVisitasController.php
Controllers/Api/VendasController.php
Controllers/Api/VisitasController.php
Database/Migrations/2026-10-14-000021_PermitirReabrirPeriodoCancelado.php
Database/Migrations/2026-11-03-000001_AuditarTrocaAtendenteRetomadaMobile.php
Database/Migrations/2026-11-03-000002_CreateAgendamentosSplash.php
Database/Migrations/2026-11-03-000003_BonificacoesIndicacao.php
Libraries/AvisosSplash.php
Libraries/BonificacaoIndicacao.php
```

Obs.: este inventário compara com o `main`. Se sua HostGator já
recebeu parte desta branch, utilize `php spark migrate:status` para ver
o que realmente resta executar. Os arquivos `mobile/**` **não** devem
ser enviados à HostGator; ficam incorporados ao APK.

## Migrations

As três novas desde `main`:

1. `2026-11-03-000001_AuditarTrocaAtendenteRetomadaMobile.php`:
   tabela `visita_atendente_trocas` (auditoria opcional).
2. `2026-11-03-000002_CreateAgendamentosSplash.php`:
   tabela `agendamentos` e origem de lead correspondente.
3. `2026-11-03-000003_BonificacoesIndicacao.php`:
   tabela `indicacao_bonificacoes`.

A migration `2026-10-14-000021_PermitirReabrirPeriodoCancelado.php`
também foi **modificada** nesta branch. Se ela já aparece como aplicada,
o CodeIgniter **não** executa o novo código automaticamente. Não tente
`migrate:refresh`, rollback ou execução manual sem revisão e backup.
Verifique o índice `ix_fe_periodo` e a ausência de
`uq_fe_periodo` se o recurso de reabertura estiver habilitado.

No **servidor**, após backup e upload do código:
```bash
cd /home/CONTA/splash-backend
php spark migrate:status
php spark migrate
php spark migrate:status
php spark routes
```
Use o caminho PHP real da conta HostGator; substitua `CONTA` pelo nome real.
Se uma migration falhar, pare o deploy, preserve logs e não refaça migrations
ou índice em produção às cegas.

## Verificação financeira e de segurança

- O intervalo é pela **data da venda** e aceita até 366 dias, como o
  financeiro web. `Recebidas` corresponde ao valor efetivamente recebido
  dessas vendas, **mesmo se o pagamento ocorreu em outra data**; abatimentos
  constam separadamente. Não confundir com fluxo de caixa por data de pagamento.
- A API `GET /api/mobile/financeiro?inicio=AAAA-MM-DD&fim=AAAA-MM-DD`
  exige `Authorization: Bearer` com token `mobile`.
- Admin tem acesso ao conjunto, demais autorizados à própria conta;
  operador deve receber HTTP 403. Usuário sem pessoa ativa deve receber
  HTTP 403 ao consultar conta própria.
- Este extrato é somente leitura: não lança, paga ou estorna.
- O resumo limita-se a até **500 vendas** do intervalo; ao atingir o limite
  o app avisa para reduzir o período.

## Firebase, serviços e agendamento de avisos

No `backend/.env`, manter o caminho privado do arquivo de conta de
serviço Firebase:
```env
SPLASH_FIREBASE_SERVICE_ACCOUNT=/home/CONTA/PRIVATE/firebase-service-account.json
```
O caminho deve existir e o JSON conter a chave de **service account**.
Não coloque o `google-services.json` do Android no backend como
substituto desta chave. Para o envio real fora do app, confira cURL,
OpenSSL, FCM HTTP v1 e cron `php spark splash:avisos` (por exemplo
1 a 5 minutos se o plano permitir).

## APK conectado diretamente à produção

Em **Expo > Environment variables > production**, cadastrar:
- `GOOGLE_SERVICES_JSON` = **File / Secret** com
  `mobile/google-services.json` do app `com.ahritech.splashnext`;
- `EXPO_PUBLIC_SPLASH_API_URL` = **Plain text** com a origem HTTPS real
  do servidor, sem `/api` nem barra final.

**Somente após** publicar, migrar, validar HTTPS e testar perfis:
```powershell
cd D:\Ahritech\Sistemas\Web\splash\mobile
npx.cmd eas-cli@latest build --platform android --profile production-apk
```

Este perfil produz APK instalável com HTTP desabilitado. O perfil
`preview` continua para testes locais, mas nunca deve apontar a dados
reais pelo protocolo HTTP.

## Diagnóstico de requisições

O código anterior chamava `getDevicePushTokenAsync` dentro do listener
`addPushTokenListener`, situação documentada pelo Expo como origem de
loop. O APK corrigido usa diretamente o token do evento e aplica cooldown.
O backend agora limita e ignora registros idempotentes. Antes de usar
produção, confira a taxa de chamadas `/api/mobile/notificacoes/dispositivo`
nos logs do PHP.
