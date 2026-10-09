# SPLASH — Pessoas e Usuários

Módulo do cadastro de participantes e gerenciamento de contas. Implementação enviada ao GitHub, ainda dependente de executar a migration e validar as telas no XAMPP.

## Regras
- Pessoa = participante real do clube. Pode ser corretor, vendedor, gerente, ou combinar funções. Não precisa ter login.
- Usuário = conta individual do CodeIgniter Shield, vinculada opcionalmente a uma pessoa (relação 1:1).
- Apenas o administrador pode gerenciar os participantes e as contas. Não há criação de outros administradores pela interface.
- Pessoas com o mesmo papel podem ter comissões individuais futuras, sem acesso aos dados de terceiros.
- Um usuário existente do Shield, inclusive o administrador original, pode ser vinculado a uma pessoa sem criar outra conta.
- Inativar a pessoa bloqueia o acesso vinculado pelo Shield. Para voltar a acessar, ative a pessoa e depois reative o usuário, de forma explícita.
- Remover o papel que está associado ao grupo do usuário é bloqueado até o grupo ser ajustado.
- Credenciais do Shield não são gravadas nas tabelas de participantes. Senhas são enviadas somente para os métodos do Shield.
- Contas administrativas são protegidas de alteração de grupo, senha, situação e exclusão por essas telas.

## Tabelas criadas
- `pessoas` — informações gerais, usuário vinculado, situação.
- `pessoa_papeis` — vários papéis por pessoa.
- `pessoa_auditoria` — alterações de cadastro/acessos sem registrar senhas.

Nenhuma tabela financeira ou de vendas é criada nesta etapa. O cadastro atual fornece os participantes que serão usados futuramente nas comissões, despesas e fechamentos.

## Aplicar no computador (PowerShell)
```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php spark routes
```

Se o Vite já estiver aberto, reinicie-o ou atualize a página. Para conferir compilação:
```powershell
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

## Testes manuais essenciais
1. Abrir **Pessoas**, cadastrar alguém com os papéis Corretor e Vendedor; salvar e editar.
2. Cadastrar um Vendedor sem acesso: deve permanecer na lista sem login.
3. Na pessoa ativa, clicar **Criar acesso**; informar usuário, e-mail, senha forte e grupo correspondente a um papel cadastrado.
4. Entrar com o usuário criado: menus devem corresponder ao grupo; ele não deve ver Pessoas, Usuários nem Planos.
5. Usando a conta admin, bloquear e reativar o usuário em **Usuários**.
6. Cadastrar sua própria pessoa, clicar em **Vincular** e selecionar a conta admin criada anteriormente. Não crie novo administrador.
7. Garantir que `GET /api/pessoas` e `GET /api/usuarios` respondam **403** para usuários não administradores.
8. Verificar criação com nome de usuário ou e-mail já utilizado; deve rejeitar sem cadastrar duplicado.

### Endpoints
```
GET   /api/pessoas
POST  /api/pessoas
POST  /api/pessoas/{id}/editar
GET   /api/usuarios
POST  /api/pessoas/{id}/acesso
POST  /api/pessoas/{id}/vincular
POST  /api/usuarios/{id}/editar
POST  /api/usuarios/{id}/situacao
```

Todos os POSTs exigem CSRF. O React obtém CSRF da sessão antes de modificar os dados.

## Pendências planejadas
- Despesas pessoais por usuário, permissões finas e grupos editáveis por tela.
- Consultas de comissões reais por titular financeiro, sem expor clientes a vendedores.
- Recuperação por e-mail depende de configurar SMTP do backend.
- Tela inicial de usuário ainda apresenta indicadores sem dados, porque vendas e financeiro não foram implementados.

**Nunca executar `migrate:refresh`**: use apenas `php spark migrate`, mantendo planos e o usuário admin existentes.
