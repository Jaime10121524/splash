# SPLASH — Etapa de rateios e repasses de comissão

Implementação entregue na branch `main`, CodeIgniter 4 + Shield + React/Vite, SPA responsiva. Os dados de vendas, clientes e recebimentos existentes não são descartados.

## Funcionalidades desta etapa

**Fechamentos (admin):** a tela exibe vendas no período, comissão-base calculada pela modalidade do pagamento, pessoas responsáveis, participações e pagamentos confirmados. A tela não declara que o fechamento semanal foi liquidado.

- O corretor principal de cada venda é o **responsável inicial pela comissão**. O dono da corrente e o usuário que cadastrou a visita não substituem automaticamente o corretor responsável.
- **Definir participações**: informar manualmente quem paga, quem recebe (corretor, atendente ou gerente), o papel, valor e observações. Todos os rateios são validados em centavos. Quem recebe uma participação pode pagar outra pessoa **somente da própria participação**, sem misturar a conta dos demais.
- A pessoa não pode distribuir mais do que lhe pertence, nem pagar a si mesma, nem criar circularidade. Valores duplicados pela mesma função e pessoas são recusados.
- Sugestões visuais de 5%/10% sobre o valor de tabela para atendimento; o usuário confirma o valor efetivo, porque feriados, exceções, arredondamentos, renovações e gerente não podem ser inferidos com segurança dos dados hoje disponíveis. Nenhum pagamento automático é realizado.
- **Registrar pagamento** de participação: valor, data e observação, podendo ser parcial. O sistema controla o saldo devido a cada beneficiário. Trata-se de um pagamento já realizado informado pelo administrador; a aplicação não envia Pix nem transfere dinheiro.
- **Estornar repasse** registrado por engano com justificativa. Preserva a linha original e cria o estorno vinculado; impede estornar duas vezes.
- Rateios sem pagamentos podem ser substituídos com justificativa e auditoria de antes/depois. Rateios que já tiveram qualquer pagamento ou estorno não podem ser apagados/substituídos por esse fluxo, para conservar o histórico.
- A API de Vendas bloqueia alterações financeiras e ajustes de comissão quando existem participações rateadas. O admin pode retirar os rateios **somente antes de pagar**, para corrigir a operação de origem e apurar novamente.

**Meu financeiro (corretor, vendedor, gerente):** somente a pessoa vinculada ao próprio usuário Shield consegue consultar seu resumo. Não aparecem associados, títulos, comissões ou despesas dos demais. O relatório mostra comissões das próprias vendas, obrigações que ela rateou, participações a receber de outros, valor já pago a ela e saldo que falta pagar.

## Regras que permanecem importantes

- Rateio definitivo disponível somente para **venda com título quitado**, cuja comissão já esteja calculada ou ajustada; pendência com pagamento parcial e antecipação de comissões ainda requer etapa própria.
- Comissão de uma venda = percentual/regra da época selecionada automaticamente pelos recebimentos e, caso exista, arredondamento/ajuste manual com justificativa.
- Vendas da mãe e da esposa não passam a ser vendas do administrador por ele cadastrar ou receber os recursos. O CPF/usuário da pessoa responsável permanece distinto e assim o resumo continua individual.
- Rateio financeiro representa obrigação de comissão, não o movimento de custódia de valores do clube ou a liquidação de empréstimo.
- Não são assumidos automaticamente percentuais de 5%/10% nem 50% para todo caso. Uma renovação, dia útil/feriado, corretor da corrente ou segundo corretor pode alterar a composição.

## Arquivos

Migration `backend/app/Database/Migrations/2026-10-10-000008_CreateRateiosRepasses.php`:

- `comissao_rateios`: venda, pagador (responsável), beneficiário, papel, valor, observação;
- `comissao_repasses`: pagamentos confirmados e estornos referenciados;
- `comissao_rateios_auditoria`: substituição de rateios antes/depois com justificativa.

API: `backend/app/Controllers/Api/FechamentosController.php`, validação `backend/app/Libraries/RateioRules.php`, alteração de segurança no `VendasController.php`.

Frontend: `frontend/src/pages/Fechamentos.jsx` e `Fechamentos.css`, acessíveis em **Fechamentos** e **Financeiro**.

## Atualização local

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php spark routes
php tests\venda_money_smoke.php
php tests\rateio_rules_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

**Não use `migrate:refresh`.** Faça backup antes de aplicar no banco que já contém vendas.

## Validações manuais

1. Com título de R$ 1.176,00 integralmente quitado e comissão calculada, abra Fechamentos no período da venda.
2. Informe exemplo: corretor principal recebe base de R$ 360,00; rateio de R$ 150,00 para corretor secundário e R$ 60,00 para atendente, ambos pagos pelo corretor principal. Sobra R$ 150,00 para o principal.
3. Teste um novo rateio de R$ 20,00 **pago pelo segundo corretor** a outro participante. O segundo fica com R$ 130,00. São saldos de pessoas distintas.
4. Tente distribuir acima da comissão, incluir ciclo ou pagar a si mesmo: deve impedir.
5. Confirme um repasse de R$ 40,00 ao atendente. O saldo dele deve passar de R$ 60,00 a R$ 20,00. Tente pagar R$ 21,00: deve impedir.
6. Tente alterar o rateio já pago: deve bloquear. Estorne um repasse e confira linhas no extrato.
7. Entre como usuário vinculado à mãe ou outro corretor e consulte Financeiro: apenas totais da pessoa logada, sem os nomes dos clientes ou contas alheias.
8. Tente ajustar a comissão da venda que já possui rateios: deve bloquear, preservando os repasses.
9. Verifique `php spark migrate`, os dois testes de cálculo e `npm.cmd run build` antes de usar dados reais.

## Ainda não implementado nesta etapa

- Compensação de valores que o administrador mantém em mãos e que pertencem ao clube; transferências físicas de caixa/Pix/conta;
- Empréstimos e parcelas abatidas **por pessoa**, despesas próprias e bonificações;
- Antecipação de comissão por **pendência parcialmente paga**, seguida de conciliação na venda efetivada;
- Fechamento semanal **liquidado**, transferência para mãe/esposa, PDF dominical e balanço completo;
- Renovações, upgrades e importação de CSVs antigos.

Esta entrega é a **apuração individual de participações e registro de repasses**, a fundação financeira para os fechamentos definitivos.
