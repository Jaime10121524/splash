# SPLASH — Perfil, recuperação, relatórios e notificações (HostGator compartilhada)

## O que está no código

1. **Impressão/PDF:** demonstrativos semanais e gerenciais são impressos numa janela isolada do layout da SPA para evitar página em branco no Chrome.
2. **Meu perfil:** alterar e-mail e senha mediante senha atual, pelo modelo Shield. Só altera a própria conta; usuários continuam gerenciados pelo administrador.
3. **Recuperação:** o link do login envia solicitação genérica, sem permitir descobrir se o e-mail existe; token aleatório de 256 bits armazenado apenas como SHA-256, expira em 30 minutos, uso único. Requer SMTP operacional.
4. **Relatórios:** Acerto Semanal com escopo por pessoa e, para administrador, Vendas, Comissões por Pessoa, Atendimentos, Pendências e Títulos a Vencer, com período e impressão.
5. **Notificações:** sino privado e avisos de nova venda (participação ainda a apurar), comissão apurada (somente saldo pessoal a receber), vencimentos, retornos e pendências antigas. Banco evita evento duplicado por pessoa. A API jamais envia dados de cliente ou comissões alheias à conta do participante.
6. **Web Push:** service worker + manifesto da SPA; permissão solicitada pelo botão de ativação, depois inscrição do celular vinculada ao usuário Shield. A entrega imediata é tentada após a venda e o cron faz reenvios; sem configuração Web Push as notificações ainda aparecem no sino.

### Limites importantes

- **HostGator compartilhada não permite cron mais frequente do que 15 minutos.** Não crie cron a cada minuto. Avisos de venda tentam envio imediatamente pelo próprio PHP da venda; avisos pendentes são reprocessados no cron. Velocidade final depende dos serviços Push e do aparelho.
- **HTTPS obrigatório no domínio publicado.** Em iPhone/iPad, é preciso adicionar o site à tela inicial no Safari (iOS/iPadOS 16.4+) e abrir o ícone instalado para autorizar Web Push.
- Android Chrome/Edge e desktop modernos geralmente aceitam Web Push pela permissão do navegador em HTTPS. Não confundir Web Push/PWA com app Android nativo APK ou push Android enviado por FCM SDK.
- Pessoas sem conta de usuário e dispositivos que não autorizarem as notificações não recebem Push; o evento fica registrado nas contas cadastradas.
- **Chaves VAPID e senha SMTP são segredos:** somente backend/.env, nunca Git, frontend, resposta da API ou arquivos públicos.
- A HostGator deve ter PHP 8.2+, Composer instalado no projeto e as extensões `curl`, `mbstring`, `openssl` habilitadas. `gmp` não é obrigatório na versão usada, mas ajuda na performance.
- A configuração do SMTP precisa ser validada enviando um e-mail real; e-mail de reset não funciona antes disso.
- Não há fila externa Redis, Node em execução permanente, WebSocket nem VPS. Tudo usa PHP CLI e MariaDB, compatíveis com hospedagem compartilhada.

## Instalação local — Windows

Atualizar o repositório antes de rodar comandos. Na pasta `backend`:

```powershell
composer update minishlink/web-push --with-all-dependencies
php spark migrate
php tests/alertas_conta_relatorios_smoke.php
```

Isso atualiza a dependência e o arquivo `composer.lock` **na sua máquina**; antes de publicar em produção, versionar também o lock gerado para garantir versões iguais no servidor. Um `composer.lock` anterior à adição do Web Push não contém a biblioteca. A compilação frontend:

```powershell
cd ..\frontend
npm.cmd run build
```

Não executar reset, migrate:refresh nem excluir histórico de vendas.

## Configuração de backend/.env

Os valores abaixo são exemplos de **nomes de campos**, não credenciais válidas:

```ini
SPLASH_FRONTEND_URL = 'https://SEU-DOMINIO.COM.BR'
SPLASH_MAIL_FROM = 'contato@SEU-DOMINIO.COM.BR'

email.protocol = smtp
email.SMTPHost = 'SERVIDOR-SMTP-DA-SUA-CONTA'
email.SMTPUser = 'EMAIL-COMPLETO-DA-CONTA'
email.SMTPPass = 'SENHA-DA-CONTA-DE-EMAIL'
email.SMTPPort = 587
email.SMTPCrypto = tls

SPLASH_VAPID_SUBJECT = 'contato@SEU-DOMINIO.COM.BR'
SPLASH_VAPID_PUBLIC = 'CHAVE_PUBLICA_VAPID'
SPLASH_VAPID_PRIVATE = 'CHAVE_PRIVADA_VAPID'
```

Consulte a seção **Contas de e-mail / Conectar dispositivos** do cPanel para saber hostname, porta, criptografia e login SMTP corretos. Não presumir que as credenciais de cPanel são as credenciais de e-mail.

Gerar as chaves VAPID **uma única vez** no backend, após instalar a dependência:

```powershell
php -r "require 'vendor/autoload.php'; print_r(\Minishlink\WebPush\VAPID::createVapidKeys());"
```

Guardar a chave pública e privada; a chave privada nunca é enviada para o navegador. Ao trocar a chave VAPID após inscrever dispositivos, será necessário que os usuários façam uma nova inscrição.

## HostGator compartilhada/cPanel

Estrutura recomendada: arquivos privados do backend fora da pasta pública, frontend compilado em `public_html`, rotas `/api` encaminhadas ao `backend/public/index.php`. Ajustar a montagem real a sua estrutura e domínio — não copiar pastas `.env`, `vendor`, `writable/logs` ou backups para o diretório exposto.

1. Verificar versão PHP 8.2 ou superior, SSL/HTTPS, PDO MariaDB e extensões necessárias.
2. Publicar o código e o frontend compilado, instalar dependências no backend fora do diretório público; configurar `backend/.env`.
3. Executar `php spark migrate` uma vez, sem apagar dados, e validar login, atualização de perfil e email de recuperação real.
4. Abrir o site pelo HTTPS do domínio em cada celular, instalar o atalho/PWA quando necessário e clicar **Ativar notificações neste celular** no sino.
5. No cPanel, em **Avançado > Trabalhos Cron**, criar uma tarefa a cada 15 minutos. Escolher PHP executável da versão real da hospedagem. Exemplo de comando, com caminhos simbólicos:

```bash
/opt/cpanel/ea-php82/root/usr/bin/php /home/USUARIO_CAMINHO_PRIVADO/splash/backend/spark splash:avisos >> /home/USUARIO_CAMINHO_PRIVADO/splash/avisos-cron.log 2>&1
```

Agendamento: `*/15 * * * *`. Não usar o executável PHP 8.2 se sua hospedagem estiver configurada para outra versão; consultar o binário no cPanel. Evitar arquivos de logs dentro de `public_html`.

Se a hospedagem bloquear tráfego HTTPS de saída para serviços push, a entrega do Web Push não acontecerá. Confirmar por um teste real no Android/iPhone, conferindo PHP logs e o histórico do sino.

## Cenários mínimos a testar

- Print de Acerto Semanal com uma pessoa e com várias; deve sair com conteúdo (não folha branca). Repetir PDF de cada relatório gerencial.
- Trocar e-mail, trocar senha, senha atual incorreta, conflito de e-mail; logout/login após troca.
- Pedir recuperação com e-mail existente e inexistente; não revelar existência da conta, não reutilizar token, não aceitar token expirado.
- Criar venda com corretor, atendente, gerente e segundo corretor. Cada participante ativo com login recebe aviso de nova venda sem dado de cliente. Ao quitar e apurar, cada um recebe a **própria comissão ainda a receber**, nunca o total geral.
- Criar venda sem quitação ou com rateio em revisão: não inventar valor de comissão.
- Abrir como usuário diferente e tentar acessar IDs de avisos de terceiros: não pode marcar ou obter dados.
- Confirmar Push com PWA fechado, dispositivo com permissão, e cron de reenvio. Confirmar que após logout as inscrições do aparelho são desativadas.
- Confirmar alarmes de título com vencimento próximo, retorno previsto hoje e pendência superior a 60 dias.

## Observações finais

As verificações do GitHub executam sintaxe PHP e compilação Vite e testes estáticos, mas não exercitam sua conta SMTP, seu banco local, nem notificação real no sistema operacional. São obrigatórios testes manuais na hospedagem e um aparelho inscrito. No primeiro uso, o resultado do envio pode variar conforme conexão, permissão, economia de bateria e política do navegador.
