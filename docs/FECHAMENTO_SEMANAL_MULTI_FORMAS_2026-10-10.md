# SPLASH — Fechamento semanal por pessoa com múltiplas formas

**Implementado na branch `main`** como avanço incremental. Não há transferência automática de dinheiro nem liquidação contábil global do clube: o administrador confirma os pagamentos que realmente realizou.

## 1. Filtros do Financeiro

Os campos **De**, **Até** e **Conta de** agora ficam alinhados na mesma linha em telas largas; telas pequenas usam layout mobile-first. Os cards do resumo mantêm título e valor alinhados à esquerda, sem quebras ou espaçamentos aleatórios.

## 2. Regras especiais do plano sem engessar percentual

Em **Fechamentos → Regras e feriados → Exceções por plano e forma de pagamento**, o administrador pode cadastrar uma exceção para:

- **Versão do plano** (não apenas o código atual — preserva as versões antigas);
- **Modalidade do pagamento do cliente**: Todas, À vista (100%), Cartão, Misto;
- **Tipo de dia**: Dia útil, feriado/fim de semana, ou todos;
- **Papel**: Atendente/Vendedor ou Gerente;
- **Cálculo**: Valor FIXO em reais ou percentual personalizado sobre o valor de tabela.

**Exemplo:** Plano com valor de R$ 1.176,00 gera 5% = R$ 58,80. Para pagar R$ 60,00 ao atendente no fim de semana, cadastre **valor fixo de R$ 60,00**, forma Todas e Outros dias, para a versão do plano de um ano. Se a mesma modalidade 100% à vista precisa pagar mais, cadastre outra exceção mais específica com modalidade À vista. As regras mais específicas prevalecem.

As exceções não recriam nem alteram comissões históricas já apuradas ou pagas. Para uma venda já rateada, use **Conferir/corrigir rateios por venda** antes de lançar qualquer pagamento. A liberação de gerente em dia útil permanece sujeita às regras de elegibilidade existentes: não cria gerente se não foi vinculado à venda.

## 3. Fechamento por pessoa — uma baixa para várias vendas

A tela **Fechamentos → Quanto pagar a cada pessoa → Registrar acerto da pessoa** consolida **todas as participações pendentes dessa pessoa nas vendas do período**. O administrador escolhe data de pagamento e uma ou mais linhas de forma de pagamento (Pix, dinheiro, transferência etc.), cada uma com seu valor.

Exemplo:
- Vendedor tem duas participações pendentes, R$ 35,00 e R$ 25,00.
- Foi pago em **um único acerto**: Pix R$ 40,00 + Dinheiro R$ 20,00.
- O sistema grava **um acerto de R$ 60,00** com identificador próprio.
- Repartição pelos títulos, da venda mais antiga para a mais recente:
  - Venda A: R$ 35,00 no Pix.
  - Venda B: R$ 5,00 no Pix + R$ 20,00 em dinheiro.
- As duas vendas ficam quitadas com os respectivos métodos, sem o administrador lançar duas baixas manualmente.

Pagamentos **parciais** são permitidos. Uma pessoa pode receber agora R$ 40 de um saldo de R$ 60 e deixar R$ 20 pendentes.

**Segurança:** o servidor reconstrói os saldos dentro de uma transação, bloqueia vendas relacionadas para evitar pagamentos concorrentes, recusa pagamentos acima do saldo, valida formas ativas e registra uma chave única para impedir baixa duplicada em reenvio. Se a pessoa também recebe e redistribui comissão na mesma venda (repasse em cascata), o acerto automático é **bloqueado** para exigir conciliação manual, evitando pagar duas vezes.

## 4. Formas de pagamento em lançamentos individuais

As telas anteriores **Registrar pagamento do corretor principal** e **Extrato do participante → Registrar pagamento** agora exigem escolher a forma. O extrato pessoal exibe por movimento o método (Pix, dinheiro etc.). Os registros antigos **não têm forma conhecida**: aparecem como **Forma não informada**, sem atribuição retroativa inventada.

Em **Fechamentos → Acertos registrados**, os pagamentos em lote ficam listados com pessoa, data, período das vendas, total e discriminação por forma. Estornos posteriores permanecem no extrato da participação; o cabeçalho histórico do lote corresponde ao valor originalmente registrado.

## 5. Banco

As migrations novas (sem reset de dados) são:

- `2026-10-10-000011_FechamentoLotesFormas.php`
  - `comissao_lotes_pagamento`: acerto consolidado por pessoa, semana/período, valor, data, chave de idempotência.
  - Campos `lote_id` e `forma_id` opcionais em `comissao_repasses` e `comissao_titular_movimentos`, para respeitar histórico legado.
- `2026-10-10-000012_ExcecoesComissaoPlano.php`
  - `comissao_excecoes_plano`: versão, modalidade, tipo de dia, papel e valor fixo/percentual.

Novos componentes: `DistribuicaoPagamento.php`, `fechamento_lote_smoke.php`. Os ajustes de interface estão em `Fechamentos.jsx/.css`, `Financeiro.css` e na API.

## Instalação e validação no XAMPP

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main

cd backend
php spark migrate
php tests\rateio_rules_smoke.php
php tests\rateio_automatico_smoke.php
php tests\financeiro_saldos_smoke.php
php tests\fechamento_lote_smoke.php

cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

**Faça backup antes de aplicar. NÃO use `migrate:refresh`.**

### Conferências práticas
1. Financeiro: desktop com De / Até / Conta de alinhados, sem quebra involuntária; cards com total/pago/pendente legíveis no celular.
2. Cadastre exceção de R$ 60,00 para o plano e dia adequados; na **próxima venda quitada** confirme apuração de R$ 60 ao atendente, mantendo os 40% ou outra regra correspondente ao corretor.
3. Em Fechamentos, selecione a semana, abra a pessoa com duas participações pendentes e clique **Registrar acerto da pessoa**.
4. Informe **Pix R$ 40,00** e **Dinheiro R$ 20,00**, confirme uma vez. Verifique ambas as vendas no extrato e o lote em **Acertos registrados**.
5. Tente repetir o mesmo envio ou pagar acima do saldo: não pode criar saldo indevido.
6. Com login de atendente, confirme o próprio total, pago e falta receber, **sem acesso a outras contas ou dados do associado**.
7. Se houver repasse em cascata, o sistema deve pedir conferência manual antes da baixa automática.
8. Confira a forma de pagamento nos lançamentos individuais antigos (**não informada**) e nos novos.

## Pendências distintas desta etapa

O **fechamento dominical contábil global** ainda não inclui empréstimos e amortizações por pessoa, despesas, bonificações, compensações de dinheiro que ficou com você e pertence ao clube, antecipações de pendências nem PDF oficial. A tela entregue registra o **acerto por pessoa** de comissões de vendas já quitadas; não equivale ao fechamento de caixa integral do clube.

A estrutura foi publicada e revisada; a execução das migrations, smoke tests e compilação React ainda precisa ser confirmada localmente.
