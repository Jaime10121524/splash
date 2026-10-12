# SPLASH

Sistema de gestão de títulos, visitas, pendências, vendas, comissões, renovações e fechamentos de um clube.

## Tecnologias
- **Backend:** PHP 8.2+, CodeIgniter 4 e CodeIgniter Shield (sessões e permissões).
- **Frontend:** React + Vite, SPA responsiva/mobile first.
- **Banco:** MariaDB/MySQL (InnoDB).
- **Aplicativo:** PWA no início; empacotamento com Capacitor/Android em etapa posterior.
- **Relatórios:** PDF.
- **Hospedagem:** desenvolvimento no XAMPP e publicação na HostGator (frontend compilado + PHP).

## Início rápido (Windows / PowerShell)

Pré-requisitos: PHP 8.2+ com extensões do CodeIgniter, Composer 2, Node.js e npm, Git.

```powershell
cd C:\xampp82\htdocs
git clone https://github.com/Jaime10121524/splash.git
cd splash
.\setup-local.ps1
```

O script cria `backend/` pelo AppStarter oficial do CodeIgniter, instala o Shield e cria `frontend/` pelo Vite. Não preenche senhas nem configura o banco de dados.

Depois:
1. Crie um banco `splash` no MariaDB/MySQL local (InnoDB, `utf8mb4`).
2. Edite **somente localmente** o arquivo `backend/.env`, definindo `CI_ENVIRONMENT`, `app.baseURL` e `database.default.*`; jamais o envie ao Git.
3. Execute `cd backend` e `php spark shield:setup` somente depois de configurar o banco; valide a instalação e as migrations do Shield.
4. Terminal A: `cd backend; php spark serve --host 127.0.0.1 --port 8080`.
5. Terminal B: `cd frontend; npm run dev` (normalmente porta 5173).

**Estado atual:** os módulos operacionais de vendas, visitas, comissões, fechamentos, relatórios e alertas já possuem implementação. Antes de usar em produção, execute as migrations e os testes locais e siga o guia de implantação na HostGator. O app nativo requer domínio HTTPS e configuração Firebase/Android Studio para validação final.

## Organização planejada
```text
splash/
  backend/                # CodeIgniter 4 + Shield (gerado no setup)
  frontend/               # React + Vite (gerado no setup)
  docs/
    REQUISITOS.md         # Regras do negócio aprovadas
    MODELO_DADOS.md       # Diretrizes do banco e financeiro
  setup-local.ps1
  .gitignore
```

## Princípios
1. Regras e percentuais comerciais configuráveis no banco, com vigência/histórico e valores congelados nas vendas.
2. Separar **dono do direito financeiro**, **quem recebeu fisicamente o dinheiro** e **quem efetivamente realizou o pagamento**.
3. Fechamento administrativo central pelo usuário administrador, sem compensar dívidas entre corretores diferentes.
4. Não lançar como dívida atual uma comissão histórica importada sem controle de sua quitação.
5. Permissões de privacidade implementadas **na API**, nunca apenas escondendo informações na tela.
6. Valores monetários em DECIMAL; lançamentos com rastreabilidade, evitando sobrescrever histórico de pagamentos.
7. A pasta `backend/public` (ou um ponto de entrada devidamente isolado) deve ser a única parte do backend exposta publicamente na HostGator.

Consulte [REQUISITOS](docs/REQUISITOS.md) e [MODELO DE DADOS](docs/MODELO_DADOS.md) antes de implementar mudanças.

## Publicação e aplicativo móvel

- [Guia de implantação HostGator, Capacitor e backups](docs/IMPLANTACAO_SPLASH_HOSTGATOR_CAPACITOR.md)
- Preparar pacotes na raiz: `powershell -ExecutionPolicy Bypass -File .\\deploy\\hostgator\\preparar-pacote.ps1`
- Backend privado: `php spark splash:backup` e `php spark splash:avisos` para cron.
- Capacitor: `frontend/capacitor.config.ts` com frontend compilado; `frontend/.env.capacitor.local` obrigatório para autenticação HTTPS.
- Nenhuma credencial ou arquivo de banco deve ser armazenado no GitHub.
