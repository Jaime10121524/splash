# SPLASH — Extrato financeiro visual por perfil e por pessoa

## Interface

Menu **Financeiro → Extrato geral**. Blocos verdes representam **direitos pessoais** (comissões, atendimento, participação, recebidos e a receber). Blocos vermelhos mostram **obrigações de repasse, despesas e empréstimos**. O filtro Agrupar por oferece Pessoa ou Tipo de entrada/saída, e Exibir permite entradas, saídas ou ambos.

Lançamentos exibem a origem da venda, data, valores totais e situação de recebimento/pendência. Histórico de pagamentos e abatimentos é expansível. O resumo geral aparece ao final.

## Permissões obrigatórias

- Administrador: consulta os valores por titular e obrigações operacionais do grupo. Pode filtrar por pessoa, ver gastos e empréstimos. A soma de créditos de terceiros **não é receita pessoal do administrador**.
- Corretor independente: vê **seus créditos**, **despesas e empréstimos próprios**, e os repasses que **ele é responsável por efetuar**, inclusive das vendas de corretores atualmente vinculados à sua operação.
- Corretor vinculado (ex.: Marta ou Helena sob James): vê **somente** sua comissão, participações, despesas e empréstimos próprios. Não vê o rateio detalhado, pagamentos e contas de vendedor/gerente/terceiros.
- Vendedor e gerente: veem **somente** suas comissões/participações, quanto foi recebido e o saldo a receber. Não têm acesso à API de despesas e empréstimos.
- A autorização não depende de esconder componentes na interface: `/api/fechamentos/contas` omite repasses detalhados de não autorizados; `/api/financeiro/pessoal` revalida o perfil e a pessoa da sessão.

## Valores, sem dupla contagem

- Comissão própria do titular já vem **líquida das participações de terceiros**. Portanto, repasses exibidos em vermelho são obrigações operacionais, **não** um segundo desconto do resultado pessoal.
- Total de créditos é o direito pessoal apurado (comissões e participações). Recebido e a receber são **situações deste mesmo direito**.
- Despesas ativas são gastos lançados no período; registro de despesa **não comprova pagamento bancário**.
- Empréstimo exibe valor original, total abatido e saldo atual; amortização pode ser compensação de comissão **sem saída de dinheiro**.
- Resultado gerencial = direitos pessoais menos despesas registradas, apenas estimativa. Repasses pendentes e empréstimos são exibidos separadamente para não descontar quantias duas vezes.
- A consulta considera **data da venda**, mas pagamentos da respectiva venda podem ocorrer depois. Empréstimos exibem saldo atual. Não confundir com saldo bancário ou caixa sob custódia.
- O sistema não gera nem altera pagamentos ao abrir o extrato.

## Arquivos modificados

- `frontend/src/pages/Financeiro.jsx` — apresentação visual, agrupamento, resumo e filtros
- `frontend/src/pages/Financeiro.css` — visual verde/vermelho e mobile first
- `backend/app/Controllers/Api/FechamentosController.php` — repasses por beneficiário, originados em vendas do grupo e associados ao responsável operacional
- `backend/app/Controllers/Api/FinanceiroPessoalController.php` — restrição de vendedor e gerente no servidor
- `backend/app/Libraries/ExtratoPermissoes.php` — regras explícitas de acesso
- `backend/tests/extrato_permissoes_smoke.php`, `.github/workflows/ci.yml` — validação de escopo

## Atualização local

Não há novas migrations. Faça backup de sua pasta antes de atualização manual de arquivos modificados fora do Git.

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php tests\extrato_permissoes_smoke.php
cd ..\frontend
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

## Conferência manual no MariaDB

1. Administrador: abrir Financeiro e comparar os totais de cada pessoa com os movimentos já cadastrados.
2. James: verificar que a parte própria recebida por ele é verde e despesas/obrigações são vermelhas.
3. Venda de Marta com atendente e gerente: os repasses originados da venda devem aparecer na visão operacional do responsável James; Marta continua com seu extrato próprio, sem informações financeiras dos terceiros.
4. Corretor autônomo independente: vê despesas próprias e pagamentos que gerencia, nunca outras operações independentes.
5. Vendedor e gerente: não veem abas de Despesas ou Empréstimos, nem conseguem consultar essas APIs.
6. Conferir agrupamentos Pessoa/Tipo no desktop e no celular, com histórico expandido.
7. Conferir operação com empréstimo: abatimento reduz a dívida e a comissão sem ser duplicado como dinheiro recebido.

O CI cobre sintaxe, compilação do frontend e regras de permissão puras. Os valores e escopos reais devem ser testados também com o MariaDB da aplicação.
