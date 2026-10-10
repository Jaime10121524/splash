# SPLASH — Correções de Financeiro, Fechamentos e Dashboard

## Despesas e empréstimos
O cadastro, a edição e o cancelamento usam modais. O administrador seleciona a pessoa dentro do formulário mesmo quando o filtro está em Todas as pessoas. Despesas ficam vinculadas ao responsável e à categoria, com edição apenas de registros ativos. Empréstimos são cadastrados e editados pelo administrador enquanto não houver abatimentos. Registros cancelados preservam o motivo e o histórico.

## Fechamento semanal
Foi adicionada a conferência de caixa por corretor com comissão bruta das próprias vendas, participações a repassar, parte própria recebida e ainda sem baixa, despesas individuais, líquido estimado, dívidas, beneficiários e valores pendentes. O fluxo de acerto por pessoa permite informar separadamente Pix, dinheiro e abatimentos de empréstimo, com baixa das participações nas vendas.

Uma comissão apurada não significa dinheiro em mãos. Valores que ficaram com o corretor e pertencem ao clube, inclusive Pix retido, precisam de uma conciliação de custódia. Por isso a parte própria ainda sem baixa não é necessariamente o valor definitivo devido pelo clube, e o líquido após despesas é uma estimativa, não o saldo bancário.

## Dashboard
A visão geral usa consultas existentes de visitas, vendas, comissões, despesas e empréstimos; mostra lançamentos recentes e oferece atualização. Perfis não administradores visualizam somente seus dados; o operador vê apenas atendimentos.

## Atualização local
Antes de migrar, faça backup do banco. NÃO use migrate:refresh.

PowerShell:
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php tests\financeiro_emprestimos_smoke.php
php tests\fechamento_lote_smoke.php
php tests\financeiro_saldos_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev

## Testes de aceitação
1. Despesas em Todas as pessoas: abrir modal, escolher pessoa, categoria e valor, salvar, editar e cancelar.
2. Empréstimos: cadastrar, editar sem abatimento, consultar saldo; confirmar bloqueio de edição após abater.
3. Fechamentos: escolher período e pessoa, conferir recebimentos, obrigações, líquido projetado e dívidas.
4. No acerto, informar duas formas e abatimento negociado; conferir redução de comissão pendente e dívida.
5. Dashboard: comparar os indicadores às telas origem, inclusive com perfis distintos.
6. Executar o build e os testes PHP. Sem esses resultados não há validação do ambiente de produção.

Pendentes: conciliação detalhada de custódia de valores entre corretor e clube, estorno conjunto de abatimentos e fechamento fiscal/contábil definitivo em PDF.
