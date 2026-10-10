# Auditoria de apresentação — Financeiro x Fechamento

## Por que os valores não são iguais automaticamente?

Os módulos usam critérios diferentes. Não compare `Financeiro → ganhos próprios` com `Fechamento → comissão bruta` como se fossem o mesmo valor:

- **Fechamento:** seleciona vendas do período pertencentes ao grupo, guarda comissão bruta por corretor, rateios por beneficiário e recebimentos do clube. O dinheiro do clube entra operacionalmente na conta do responsável (por exemplo, James), mas continua pertencendo aos titulares/participantes.
- **Financeiro:** demonstra direitos pessoais **após rateio**, apenas quando as vendas foram integralmente quitadas e apuradas; filtra pela data da venda. "Recebido" mostra pagamentos registrados ao beneficiário, não o dinheiro que chegou à conta do responsável. Os pagamentos podem ter datas posteriores à venda.
- **Resultado do período:** soma ganhos das vendas com participações recebidas, deduz despesas próprias e rateios de terceiros; não significa caixa bancário.
- **Custódia de dinheiro:** demonstra somente entradas reais do clube, Pix comprovadamente guardados, pagamentos efetivos e devoluções ao clube. Não é comissão própria nem uma quinta etapa obrigatória do fechamento.

Assim, igualdade entre os totais só se espera ao comparar as **mesmas vendas**, mesma situação de apuração, mesmo titular, mesmos rateios e o mesmo critério de datas. Um extrato com todas as pessoas inclui créditos pessoais de titulares diferentes.

## Problema de cálculo identificado

O fechamento calculava "a receber do clube" subtraindo simultaneamente:
- valores que chegaram do clube;
- valores pagos aos titulares;
- abatimentos de empréstimos.

Isso misturava **posse do dinheiro**, **pagamento ao beneficiário** e **compensação de dívida**, produzindo estimativa incorreta. Agora a diferença exibida é apenas `max(0, comissão bruta - entradas do clube registradas)`, com o rótulo **Comissão bruta sem entrada do clube registrada**. Não é cobrança automática; Pix antigos e retenções podem exigir conferência. Os relatórios concluídos antigos são apenas recalculados **na apresentação**, sem sobrescrever snapshots ou pagamentos.

O backend contém a regra em `FechamentoConferencia` e smoke test `backend/tests/fechamento_conferencia_smoke.php`.

## Mudanças de interface

- O Fechamento mantém quatro etapas; removida a repetição dos sete cards acima do Resultado do período.
- A Conferência do Caixa passou a ser **opcional**, acessível por botão abaixo do Resultado. Não abre sozinha, não interfere na conclusão do fechamento e não altera pagamentos.
- O Financeiro abre por padrão na conta do próprio administrador, se sua pessoa estiver vinculada à sessão Shield, em vez de somar todos os corretores como se fosse uma conta única. O filtro "Todas as pessoas (visão administrativa)" continua disponível.
- Na listagem, valores aparecem uma vez por linha; subtotais repetidos por categoria foram retirados.
- Repasses de terceiros são identificados como **obrigações operacionais**, já deduzidas das comissões próprias líquidas; não são descontadas novamente no resultado.
- Empréstimos no extrato exibem o **saldo atual da dívida** com referência ao valor original e abatimentos, não uma nova despesa mensal.
- No final há apenas um indicador de resultado estimado com explicação, sem repetir os mesmos três totais de cima.

## O que precisa de conferência real

Não foi possível validar saldos ou comparar lançamentos com o banco MariaDB local pela conexão GitHub. Isso requer verificar as mesmas vendas do fechamento e seus lançamentos no ambiente local. Não inventar diferença monetária nem ajustar lançamentos automaticamente. Recomenda-se comparar venda por venda antes de concluir que existe divergência no banco.

## Atualização

Não há migration nova neste ajuste.

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php tests\fechamento_conferencia_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```
