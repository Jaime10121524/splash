# SPLASH — Revisão de consistência: venda, comissão e fechamento

## O que foi corrigido

### Fluxo funcional obrigatório

1. Venda registrada. Os recebimentos do **cliente** entram em `venda_recebimentos` e determinam a quitação do título. O cadastro e recebimentos ainda podem ser corrigidos pelas regras existentes, desde que não tenham sido bloqueados por apuração ou movimento.
2. Quitação integral do cliente e cálculo de comissão. O rateio é calculado automaticamente em `comissao_rateios`; o administrador pode conferir participações por pessoa em Vendas, desde que não haja pagamentos de comissão e a venda não pertença a um fechamento.
3. Ao **abrir o fechamento** da semana, somente vendas integralmente quitadas, com comissão calculada e apuração confirmada podem entrar. Se alguma venda não estiver pronta, a abertura avisa o número da venda e exige regularização ANTES do fechamento. Uma venda só pode pertencer a um fechamento, independentemente do status.
4. **Imutabilidade da venda vinculada a fechamento**: as APIs de Vendas impedem editar cadastro, recebimento do cliente, estornar/devolver recebimento e ajustar comissão. O editor de rateios também fica somente para consulta. O bloqueio vale enquanto o fechamento está **aberto** e depois de **CONCLUÍDO**; é feito **no servidor**, sob lock da operação.
5. **Recebimento do clube** é registrado no Fechamento como entrada no caixa sob responsabilidade do titular financeiro. Não é pagamento ao vendedor/corretor/gerente. Portanto, não baixa a comissão individual por conta própria.
6. **Pagamento ao beneficiário**: no Fechamento aberto, o administrador registra o pagamento efetivamente realizado ao titular ou a um participante, que é gravado respectivamente em `comissao_titular_movimentos` ou `comissao_repasses`. É este movimento que reduz “a receber” no Financeiro e em Vendas.
7. **Fechamento concluído**: o relatório fica congelado. Se o administrador concluiu com pagamentos ainda pendentes, estes permanecem **a receber** na conta do beneficiário; fechamento concluído não inventa pagamento. Não é permitido reabrir a venda e alterar sua comissão para forçar o saldo a zero.
8. As rotas antigas de pagamento/acerto fora do Fechamento não podem pagar ou estornar comissões de vendas já vinculadas. Pagamentos antigos independentes continuam apenas para vendas ainda fora de fechamentos, de acordo com seus próprios controles.

### Telas

- **Vendas (listagem)**: mostra separadamente preço/recebimento do cliente, comissão bruta, **comissão paga aos beneficiários** e **comissão ainda a pagar**. Se a venda estiver em fechamento, mostra o número e o status.
- **Vendas (detalhe)**: apresenta, para cada pessoa, comissão ganha, paga e pendente, refletindo as mesmas tabelas utilizadas pelo Financeiro. Recebimentos do clube aparecem como informação do **conjunto de vendas do titular naquele fechamento**, NUNCA como pagamento daquela venda ou àquela pessoa.
- Ações de edição, ajuste, estorno, devolução e lançamento de recebimento do cliente ficam desabilitadas em vendas vinculadas. O backend aplica os mesmos bloqueios independentemente do navegador.
- **Financeiro por pessoa**: permanece com suas comissões, participações, pagamentos e saldos, sem reintroduzir a visualização consolidada duplicada.
- **Fechamento**: continua com quatro etapas. Nenhuma conferência de caixa foi reativada.

## Reset de testes irreversível

Migration exclusiva criada em:

`backend/app/Database/ResetScripts/2026-10-10-235959_ResetarVendasFinanceiroTestes.php`

**Não fica no diretório normal de migrations**; `php spark migrate` **NÃO executa este reset**. A única execução permitida é através do comando específico:

```powershell
cd D:\Ahritech\Sistemas\Web\splash\backend
php spark migrate
php spark splash:reset-test-data APAGAR_TODAS_AS_VENDAS_E_FINANCEIRO
```

Exige simultaneamente:
- Execução por CLI.
- `CI_ENVIRONMENT=development`.
- Banco MySQL/MariaDB em host local (`localhost`, `127.0.0.1` ou `::1`).
- Frase exata de confirmação, passada no comando.
- Execução única: a migration registrada não pode ser novamente executada por este comando.
- Back-up completo `.sql` do banco local ANTES da execução.

O reset elimina **TODOS os registros** de:
- Venda/pendências: `venda_operacoes`, `venda_recebimentos`, histórico de edição e ajustes de comissão.
- Comissões: `comissao_rateios`, `comissao_rateios_auditoria`, `comissao_auto_apuracoes`, `comissao_repasses`, `comissao_titular_movimentos`, `comissao_lotes_pagamento`.
- Fechamentos: `fechamento_periodos` e tabelas de vendas, pessoas, entradas do clube, repasses, pagamentos de titular, abatimentos, eventos.
- Custódia anterior: `fechamento_custodia_movimentos` e `fechamento_custodia_pix_vinculos`.
- Financeiro pessoal: `financeiro_despesas`, `financeiro_emprestimos`, `financeiro_emprestimo_abates`.

**Permanece no banco**: contas Shield/usuários, pessoas/corretores, grupos, vínculos de responsabilidade, clientes, planos e versões, configurações/regras de comissão, formas de pagamento, origens, categorias de despesas, feriados, visitas/atendimentos e seus históricos. Visitas anteriormente marcadas como `VENDA` e vinculadas a vendas excluídas voltam a `PENDENCIA` para não apontarem venda inexistente. IDs auto-incrementais não são zerados, apenas os registros são eliminados.

O reset usa DELETE transacional com FKs ativas e valida se outras tabelas têm dependências inesperadas: **não desabilita as chaves estrangeiras**, não faz TRUNCATE com commit implícito e não executa SQL quando detecta esquema incompleto. O rollback de dados **não existe**. Só recuperar backup.

## Checklist manual com MariaDB local

1. Gere venda integralmente quitada com rateios James/Helena/Marta, confira os totais por pessoa em Financeiro.
2. Abra o fechamento semanal e verifique que Vendas fica bloqueada, mesmo antes de concluir.
3. Lance **recebimento do clube**; a informação de entrada do clube aparece no fechamento, mas comissões individuais ainda aparecem a receber.
4. Registre o pagamento à Helena e ao James no fechamento; em Vendas e no Financeiro devem aparecer como pagos, com saldo zero se quitados por inteiro.
5. Conclua o fechamento e tente alterar plano, valor recebido do cliente, comissão e participantes pela interface e pela API: deve receber HTTP 409.
6. Teste uma venda parcialmente paga pelo cliente: a abertura do fechamento deve rejeitar, indicando o número da venda.
7. Conclua um fechamento com pendência real: ela deve continuar aberta no Financeiro **porque não foi paga ao beneficiário**, não por falha na atualização da tela.
8. Exporte backup e execute o reset; consulte contagens de `venda_operacoes`, `comissao_rateios`, `comissao_repasses`, `fechamento_periodos`, `financeiro_despesas`, `financeiro_emprestimos`; todas devem ser zero. Usuários/pessoas/planos devem permanecer.

O CI inclui PHP lint, smoke tests de regras financeiras, proteção de vendas e build do frontend. **Ainda é necessário validar os saldos com o MariaDB local** antes de uso em produção.
