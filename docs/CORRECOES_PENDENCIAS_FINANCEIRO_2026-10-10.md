# SPLASH — Visitas utilizadas, rateio automático e módulos separados

## 1. Visita já associada a outra negociação
- Em **Nova pendência**, o select lista apenas visitas do cliente encerradas como `PENDENCIA` e ainda **sem vínculo** com `venda_operacoes`.
- Em **Nova venda**, lista apenas visitas encerradas como `VENDA` que ainda não foram utilizadas.
- A API de Vendas confere o vínculo novamente e mantém o índice único por visita. Não é permitido vincular a venda concluída a uma pendência.
- Quem precisa corrigir uma operação existente deve abrir seu extrato, não usar a mesma visita para uma nova venda.

## 2. Participações financeiras automáticas
Antes, calcular comissão e ratear eram processos separados. A partir desta etapa, o recebimento que **quita o título** aciona a criação idempotente das participações, quando a comissão já está definida. Nenhuma linha é marcada como paga automaticamente.

Exemplo com **Marta corretora, James atendente e nenhum gerente**:
- Titular da comissão: Marta.
- Atendimento: James recebe a participação calculada em relação ao **valor de tabela**; 5% aos sábados, domingos e feriados cadastrados, 10% em dia útil.
- Se Marta atender seu próprio cliente, não se cria pagamento de atendimento para ela mesma.
- Se houver segundo corretor, a parcela é calculada sobre o **saldo da comissão após as participações**; o padrão configurável é 50% desse saldo.
- O gerente só participa quando estiver **expressamente vinculado à venda** e quando se aplicar a regra configurada (inicialmente 5%, não em dia útil nem renovação identificada de outro corretor).
- Quando a venda é lançada **sem visita vinculada**, o formulário permite selecionar um ou dois atendentes. Se houver visita, o sistema aproveita quem realmente atendeu nela.
- Feriados municipais, estaduais e nacionais não são inferidos por suposição: é preciso cadastrar datas aplicáveis em **Fechamentos → Regras e feriados** antes de apurar. É possível ajustar os percentuais ali, sem afetar rateios existentes.
- Se faltarem dados, a comissão for insuficiente ou um participante não tiver papel adequado, a operação fica **Para revisar**, sem atribuir rateio fictício.
- Distribuições já salvas ou com pagamentos não são sobrescritas pelo gerador automático.
- O corretor principal conserva **sua parte própria**, que não é um repasse a si mesmo; a outra pessoa recebe um rateio pendente que você poderá marcar pago após o pagamento real.

### Vendas antigas já cadastradas
Fechamentos → escolha o período da venda → **Apurar vendas anteriores**.
O processamento preserva participações manuais e evita repetir rateios já registrados. Retorna quantos foram criados, já existiam, precisam de revisão e aguardam quitação.

> O rateio automático inicial só é definitivo após **quitação integral**. A antecipação de comissão em pendência parcialmente paga, adiantamentos e devoluções posteriores à distribuição exigem módulo adicional de ajustes financeiros. Não são contabilizados sem confirmação.

## 3. Separação Financeiro x Fechamentos
- **Financeiro:** contas por pessoa, participação prevista, repasses confirmados e pendentes, sem misturar saldos de James, Marta ou outra pessoa. Usuário comum vê apenas seus números.
- **Fechamentos:** apurar vendas de um período, conferir participantes, revisar rateios, registrar pagamentos realizados, estornos e políticas.
- O fechamento de domingo liquidado com empréstimos, bonificações, despesas, recursos do clube e PDF ainda não está pronto; esta é a etapa de apuração + controle individual.

## Instalação
```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php tests\rateio_rules_smoke.php
php tests\rateio_automatico_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

Nova migration: `2026-10-10-000009_RateioAutomaticoPoliticas.php`. Não use `migrate:refresh`. Faça backup do banco.

## Testes manuais
1. Abra **Nova pendência** para o cliente teste: o atendimento #2 vinculado à venda não deve aparecer.
2. Abra uma venda quitada, com Marta corretora, James atendente e sem gerente, usando a data do exemplo. Ao registrar último pagamento, entre em Fechamentos e confirme James entre os rateios, `pago=0` e a diferença como parcela de Marta.
3. Em venda já existente e quitada, clique **Apurar vendas anteriores**; confirme uma geração única, sem duplicidade ao repetir.
4. Confira que **Financeiro** apresenta contas por pessoa, enquanto **Fechamentos** apresenta vendas e distribuição por operação.
5. Teste percentual dia útil versus fim de semana e feriado configurado.
6. Tente distribuir mais do que a comissão: deve recusar. Grave um pagamento parcial ao atendente e confirme saldo pendente.
7. Usuário corretor comum não pode acessar endpoints de apuração de outros usuários.

O GitHub foi atualizado, mas o build e as migrations precisam ser executados localmente. Não há confirmação do funcionamento em produção.
