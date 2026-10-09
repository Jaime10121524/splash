# SPLASH — Primeiro acesso e interface SPA

A interface React usa a identidade Ahritech (#7861F9) inspirada em AHRIBIO e AHRIFLOW.
O backend autentica usando sessões CodeIgniter Shield; o frontend não armazena senhas nem tokens em localStorage.

## Atualizar arquivos do GitHub

No PowerShell na raiz do SPLASH:
```powershell
git pull origin main
```

## Configurar e iniciar backend

Edite `backend/.env` (fora do Git) para conectar ao banco `splash`.
Confirme que as migrations do Shield foram executadas:
```powershell
cd backend
php spark migrate --all
php spark routes
php spark shield:user --help
```

Se ainda não houver usuário, use o comando interativo:
```powershell
php spark shield:user create
```

O administrador deve ter o grupo **admin**. Para atribuí-lo, veja a sintaxe da versão instalada em `php spark shield:user --help`, na ação `addgroup`. Não mantenha contas com acesso administrativo sem necessidade.
**Registro público foi desligado** no arquivo `app/Config/Auth.php`.

Inicie:
```powershell
php spark serve --host 127.0.0.1 --port 8080
```

## Iniciar frontend (outro terminal)

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Abra **http://localhost:5173/**. O Vite encaminha `/api` e `/login` ao CodeIgniter na porta 8080.

## Endpoints de sessão já implementados

- `GET /api/session` — sessão, usuário e CSRF.
- `POST /api/session/login` — login **por usuário e senha**, limitado por IP.
- `POST /api/session/logout` — encerra sessão.
- `GET /login/magic-link` — recuperação por e-mail do Shield; requer configurar envio de e-mail no backend.

As rotas de login e logout POST recebem proteção CSRF. Em produção, hospede frontend e API sob a mesma origem (ou revise explicitamente CORS, cookies e CSRF se optar por origens separadas).

## Estado atual do desenvolvimento

**Pronto:**
- Layout SPLASH responsivo com navegação e tema claro/escuro.
- Login real por Shield e sessão persistida no servidor.
- Menus adaptados por perfil (admin, corretor, vendedor, gerente, restrito).
- Endpoints de sessão; registro público desativado.
- Página inicial e telas de módulo **sem valores inventados**.
- Acesso rápido por menus, sem ações de cadastro fingindo salvar dados.

**Ainda não pronto:**
- Cadastros de planos, clientes, usuários administráveis, atendimentos e vendas.
- Regras de comissão, lançamento financeiro e fechamento.
- Dashboards calculados a partir das tabelas.
- Relatórios PDF, importações e notificações.
- Empacotamento Android via Capacitor.

As futuras APIs de negócios precisarão validar permissões/escopo de acesso **no servidor** e expor somente valores próprios para corretores, vendedores e gerentes; ocultar um menu não é suficiente.

## Validação

O GitHub Actions possui fluxo de build do React e lint de sintaxe PHP em `.github/workflows/validate.yml`.
Execute `npm.cmd run build` no frontend e `php spark routes` no backend antes do primeiro deploy. Não foi possível executar a instalação do usuário local por acesso remoto.

## Hospedagem HostGator

Publique os arquivos de `frontend/dist` como estáticos e a aplicação PHP sob um `public/` protegido corretamente; o document root público jamais deve permitir baixar `.env`, `writable/` ou código PHP do backend.


## Ajustes de autenticação — 09/10/2026

- Corrigido o erro PHP \`SessionController::show()\` herdando de \`ResourceController\`: agora usa \`BaseController\`.
- Tela \`/login/magic-link\` usa visual do SPLASH, em português, com o formulário do próprio Shield, preservando proteção CSRF.
- A página exibida após solicitar o link e a tela \`/login\` tradicional também usam o mesmo layout e CSS.
- O link **Voltar ao login** retorna à SPA React, em vez de abrir a página padrão do Shield.
- Login tradicional usa \`username\` e \`password\`. Cadastro público continua desabilitado.
- Na autenticação concluída pelo Shield em ambiente de desenvolvimento, a rota raiz do backend redireciona à SPA.
- O frontend distingue erro HTTP do backend de falha de conexão.

Para personalizar a origem do frontend, configure no \`backend/.env\` (opcional):
\`\`\`ini
SPLASH_FRONTEND_URL = 'http://localhost:5173/'
\`\`\`
Se não especificada, a origem é esta no ambiente development.

**E-mail:** o Shield envia um **link temporário de acesso**, não uma alteração automática de senha. O envio requer configurar \`backend/app/Config/Email.php\` ou parâmetros SMTP no \`.env\`; não coloque senha SMTP no Git.

**Teste local:** rode \`php spark routes\`, abra \`http://localhost:8080/api/session\` sem caracteres extras, depois \`http://localhost:5173/\` e teste \`Esqueceu a senha?\`. Os e-mails reais dependem de SMTP configurado.
