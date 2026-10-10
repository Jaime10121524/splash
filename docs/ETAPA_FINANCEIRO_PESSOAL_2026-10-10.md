# SPLASH — Abas, despesas e empréstimos pessoais

## Mudanças entregues na branch main

A janela **Fechamentos → Regras e feriados** foi dividida nas abas **Regras gerais**, **Exceções por plano** e **Feriados**. Apenas a aba selecionada fica visível.

A tela Financeiro agora oferece três abas: **Comissões**, **Despesas** e **Empréstimos**. Os atalhos já existentes Minhas despesas e Meus empréstimos passam a abrir os respectivos módulos.

Despesas são vinculadas a pessoa, categoria, data, valor e descrição. Os cadastros iniciais de categorias são alimentação, anúncios, transporte, bonificações, hospedagem e outros. É possível criar uma categoria própria. Cancelar uma despesa exige justificativa e preserva histórico.

Empréstimos são registrados pelo administrador, individualizados por pessoa e exibidos para o próprio usuário. Um empréstimo ainda sem abatimentos pode ser cancelado pelo administrador com motivo; depois de amortizações, não pode ser simplesmente apagado.

## Exemplo: acerto com empréstimo negociado

- Comissão pendente da pessoa: R$ 300,00
- Empréstimo existente: R$ 200,00
- Pagamento no fechamento: R$ 200,00 via Pix + R$ 50,00 em dinheiro
- Abatimento acordado deste empréstimo: R$ 50,00
- Comissão liquidada: R$ 300,00
- Dinheiro efetivamente recebido: R$ 250,00
- Dívida abatida: R$ 50,00
- Saldo do empréstimo: R$ 150,00

No fechamento há campos separados para pagamentos reais e abatimentos. O abatimento não é automático e fica na conta de quem tomou o empréstimo. O valor pago e abatido é distribuído pelas vendas pendentes da pessoa, sem misturar as contas dos demais participantes.

A API valida pessoa, formas de pagamento, dívida existente, comissão pendente e limites antes de registrar a transação. A chave única do acerto previne duplicidade de reenvio.

O meio contábil ABATIMENTO_EMP não pode ser usado como pagamento do associado no módulo Vendas. Um abatimento não pode ser estornado isoladamente: uma futura reversão conjunta de acerto e dívida ainda será necessária.

## Atualização local — PowerShell

~~~powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php spark routes
php tests\financeiro_emprestimos_smoke.php
php tests\fechamento_lote_smoke.php
php tests\financeiro_saldos_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
~~~

Nova migration: 2026-10-10-000013_FinanceiroPessoal.php

**Antes de migrar, faça backup do banco. Não execute migrate:refresh.**

## Testes de aceitação

1. Confira as três abas da configuração de comissões, também no celular.
2. Em Financeiro, abra Despesas e cadastre uma alimentação de R$ 25 para a pessoa correta; confirme a categoria e o cancelamento com justificativa.
3. No menu Empréstimos, registre R$ 200 para a pessoa correta. O próprio usuário deve visualizar somente a sua dívida; não pode criar empréstimo de outra pessoa.
4. Em Fechamentos, registre um acerto de R$ 250 em dinheiro real e R$ 50 em abatimento de dívida. A comissão deve ficar liquidada em R$ 300 e a dívida deve cair de R$ 200 para R$ 150.
5. Tente abater valor superior ao saldo do empréstimo ou liquidar comissão maior que o saldo: a API deve negar.
6. Confirme que a forma interna de abatimento não é oferecida na venda de títulos.
7. Confira os valores distintos Recebido, Abatido e Pendente no Financeiro de um usuário comum, sem dados de associados ou de outras pessoas.
8. Confira saída da migration, testes PHP e build do React antes de usar dados reais.

## Pendências futuras

Esta etapa ainda não entrega o PDF oficial do domingo, caixa/transferências entre você e o clube, antecipações parciais de pendências ou reversão conjunta de um acerto com empréstimo abatido. Despesas pessoais não são descontadas automaticamente de comissões. Nenhuma transferência real é executada pela API.

Publicação feita no GitHub; execução de migrations, testes e build ainda depende de validação no seu XAMPP.
