# SPLASH — Vendas e pendências financeiras | Etapa 1

Implementação no CodeIgniter 4 + React/Vite. Arquivos publicados em main. Precisa executar as migrations no XAMPP e confirmar build / fluxos reais.

## O que funciona nesta etapa

- Negociação financeira iniciada como **Pendência** ou **Venda**; opcionalmente vinculada ao atendimento correspondente.
- Fechar pendência converte **a mesma operação** em venda: nunca duplica recebimentos anteriores.
- Número individual do título: quatro algarismos, como `1567`; sigla `P/T` ou `R/T` vem da versão do plano. O par número + sigla é único.
- Histórico de plano/código, prazo e preço, regra de comissão e participantes congelados por operação.
- Plano histórico/inativo e regra histórica podem ser utilizados apenas quando o admin marca **Cadastro histórico**. Não presumimos data de reajuste.
- Data da negociação, data da venda, início da vigência e vencimento calculado pelos meses do plano, mantendo o dia quando possível e respeitando fim do mês.
- Corretor principal e segundo corretor vêm do atendimento. São **independentes** do dono da corrente e do usuário que cadastrou.
- Recebimentos parciais/múltiplos em Pix, dinheiro, crédito, débito ou transferência, com formas configuráveis.
- Pix registrado com detentor **Com você**; cartão de crédito com detentor **Empresa**. Para os outros meios, informe o detentor. Exceções de antecipação da empresa precisam ser registradas na próxima etapa de transferências.
- Devoluções vinculadas ao recebimento original, limitadas ao saldo de cada entrada e mantendo detentor/forma originais. Entradas anteriores nunca são apagadas/alteradas.
- Saldo cobrado, saldo efetivamente recebido, saldo a receber.
- Estimativa da comissão com modelos configuráveis e **ajuste manual justificado e auditado**. Essa estimativa **não é um lançamento de comissão paga**.
- Configurações na tela Vendas/Pendências: regras e meios cadastráveis/editáveis; ao ajustar uma regra, vendas antigas preservam a fotografia usada na época.
- Administração vê os extratos. APIs pessoais para corretor, vendedor e gerente permanecem restritas nesta etapa para evitar exposição de clientes ou comissões de terceiros.
- Dashboard passa a mostrar contagens reais de operações Venda e Pendência.

## Comissão (valores base configuráveis)

Modelos iniciais disponíveis, *sem inventar datas históricas*:

1. À vista atual: 40% da tabela, descontando somente o desconto concedido pelo corretor.
2. À vista antigo: 1/3 da tabela, descontando o desconto concedido pelo corretor.
3. Cartão: 1/3 da tabela, depois 8% de desconto sobre essa comissão.
4. Misto: 1/3 da tabela; o Pix que ficou com o administrador cobre inicialmente a comissão, e somente o **restante da comissão** sofre desconto de 8%.

**Exemplo confirmado:** R$ 1.000/3 = R$ 333,33; Pix de R$ 200 já com você, resta R$ 133,33 de comissão. R$ 133,33 menos 8% = R$ 122,66; total estimado **R$ 322,66**.

Se o Pix recebido for maior que a comissão base, a regra exata de arredondamento não ficou unívoca para todos os cenários: o sistema **não força um valor**, sinaliza necessidade de conferência. O admin pode ajustar a comissão com motivo, mas os repasses seguem pendentes.

**Crítico:** modelo à vista não aceita recebimento em crédito; cartão aceita crédito; misto aceita Pix + crédito. O sistema valida para evitar comissão incorreta. Para outros casos, crie uma regra adequada após definir a operação correspondente.

## O que ainda não está pronto

Este estágio **não distribui nem liquida** comissão de corretor, segundo corretor, atendente/segundo atendente, gerente, empresa ou dono de corrente. Nem registra transferências de detentor, adiantamentos, empréstimos, deduções no fechamento, despesas pessoais, antecipações da empresa, fechamento dominical em PDF, renovações/upgrades ou importação CSV de fotos antigas. Os recebimentos e devoluções funcionam como extrato histórico; comissão calculada é prévia.

As próximas etapas serão: **repasses e participações em cada venda**, conta-corrente/transferências, dívidas e fechamentos semanais; depois importação CSV histórica, renovações e títulos.

## Banco (somente migrations pendentes)

- `2026-10-10-000004_CreateOperacoesVendas.php`: `venda_formas_pagamento`, `venda_regras_comissao`, `venda_operacoes`, `venda_recebimentos`.
- `2026-10-10-000005_AjusteComissaoOperacao.php`: campos de ajuste justificado + tabela `venda_comissao_ajustes`.
- O cadastro de planos bloqueia edição ou exclusão de versões referenciadas por `venda_operacoes`.

Não use `migrate:refresh`. Faça backup do banco antes de aplicar novas migrations no ambiente que contém dados reais.

## Atualização local (PowerShell)

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main

cd backend
php spark migrate
php spark routes
php tests\venda_money_smoke.php

cd ..\frontend
npm.cmd ci
npm.cmd run build
npm.cmd run dev
```

O comando `npm.cmd ci` reinstala as dependências conforme o package-lock, caso estejam divergentes; ele pode ser omitido se as dependências já estiverem corretas.

## Testes obrigatórios

1. Ter clientes, corretores, plano ativo e origem. Finalize um atendimento como **VENDA** e selecione **Registrar título**. Grave título `1567 P/T`, confira cliente, participantes, data e prazo. Tente cadastrar `1567 P/T` outra vez; deve dar conflito.
2. Finalize outro atendimento como **PENDÊNCIA**. Em Pendências registre Pix R$ 200 que fica com você, consulte o extrato. Selecione **Fechar venda**, informe número e datas. Confirme **mesmo ID de operação** e recebimento preservado.
3. Escolha plano de R$ 1.000 e modelo MISTO: adicione cartão R$ 800. Comissão estimada deve ser **R$ 322,66** e o saldo a receber R$ 0.
4. Registre uma devolução de R$ 100 referenciada ao Pix R$ 200; confirme saldo recebido R$ 900 e saldo a receber R$ 100, mantendo o extrato completo.
5. Escolha à vista atual (40%) e desconto de R$ 100 num plano R$ 1.000; valor cobrado R$ 900, comissão estimada R$ 300 (desconto saiu só da parte do corretor).
6. Escolha cartão puro sobre R$ 1.000: comissão estimada R$ 306,66, com possibilidade de ajuste manual para arredondamento do clube acompanhado de justificativa.
7. Escolha plano antigo (inativo) com Cadastro histórico. Confira se o histórico não altera cadastro do plano.
8. Entre como usuário comum e tente acessar `GET /api/vendas`: a API deve negar 403. Os dados financeiros de outros usuários não podem ser exibidos.
9. Confirme `npm.cmd run build` sem falhas no frontend e `php tests\venda_money_smoke.php` passando.

## Verificações automatizadas

`.github/workflows/ci.yml` verifica lint PHP, teste de comissão e build React quando GitHub Actions estiver habilitado. Caso não haja execuções visíveis, a compilação **não deve ser declarada aprovada**; execute os comandos localmente.
