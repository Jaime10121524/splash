# SPLASH — Financeiro individual e Fechamentos por pessoa

Esta etapa refina os módulos anteriores sem apagar vendas ou rateios. Branch `main`, CodeIgniter 4 + Shield + React/Vite, responsivo/mobile-first.

## Correção da tela de participações

A linha **Observações** não usava o mesmo componente de estilo dos campos da grade. Agora os controles nativos em `.fc-rateio-item` têm largura de 100%, altura e foco padronizados, sem borda nativa do navegador.

## Financeiro — acesso por perfil

**Administrador**: período (pela data da VENDA), filtro por pessoa, totais de todas as contas e lista de vendas/atendimentos de cada titular de comissão. Pode ver nomes de clientes.

**Corretor, vendedor/atendente e gerente**: mesma conta pessoal, com total das suas participações, pagamentos confirmados e saldo pendente. Pode expandir uma venda/título e o atendimento correspondente para ver as datas e valores dos pagamentos e estornos.

A API `GET /api/fechamentos/contas` verifica a sessão e vincula usuários comuns à **pessoa ativa** por `pessoas.user_id`. O cliente não é retornado (nome, documento e telefone), as observações livres dos movimentos são ocultadas e as obrigações de repasse a terceiros não são incluídas no JSON. Não é apenas uma restrição visual.

## Fechamentos — acerto por pessoa, com descrição por venda

O painel principal passou a mostrar:
- Total de comissões atribuídas às pessoas no período;
- Já pago (registrado no sistema);
- Falta pagar;
- Para **cada pessoa**: total devido, total pago e saldo pendente;
- Dentro da pessoa: itens por venda/título e atendimento, o tipo da participação (comissão própria, atendente, gerente, segundo corretor), valores e ação de pagamento;
- O botão **Conferir / corrigir rateios por venda** abre a seção mais técnica, agora secundária.

O próprio usuário não confirma pagamentos: somente o admin, quando ocorreu de verdade. O pagador pode registrar quantias parciais e estornos. O registro de pagamento não faz transferência bancária.

## Correção estrutural: parcela própria do corretor principal

Anteriormente, `comissao_repasses` controlava a parte de outros participantes, mas não a parte própria do corretor principal. Isso impedia exibir quanto foi pago à Marta, por exemplo.

Migration `2026-10-10-000010_ComissaoTitularMovimentos.php` cria `comissao_titular_movimentos`:

- Cada pagamento pertence a uma venda e ao corretor principal daquela venda;
- Valores em centavos e tipo `PAGAMENTO` ou `ESTORNO`;
- Estorno aponta para a entrada original, e não apaga dados;
- Pagamento não pode ultrapassar a parte própria da comissão, que é **comissão total – participações que o corretor principal paga**;
- Quando há pagamento ou estorno do corretor principal, a venda e a divisão da comissão não podem ser alteradas silenciosamente.

### Exemplo prático: Marta corretora, James atendente

Plano à vista de R$ 1.176,00 no sábado, comissão de 40% e atendimento de 5%, sem gerente:

| Conta | Total devido | Pago inicialmente | Falta pagar |
| --- | ---: | ---: | ---: |
| Marta (parte própria) | R$ 411,60 | R$ 0,00 | R$ 411,60 |
| James (atendimento) | R$ 58,80 | R$ 0,00 | R$ 58,80 |

Se o administrador registra R$ 40,00 efetivamente pagos a James, o extrato dele mostrará **Total R$ 58,80, Recebido R$ 40,00, Falta R$ 18,80**. Se Marta recebeu/ficou com R$ 100,00 de sua própria comissão e o administrador registrar isso, o extrato dela mostrará **Total R$ 411,60, Recebido R$ 100,00, Falta R$ 311,60**.

Valores que o corretor já reteve no PIX exigem confirmação do administrador como pagamento recebido: **uma entrada paga pelo cliente não é automaticamente uma comissão quitada**.

## Limites desta etapa

- Saldos listados correspondem a vendas **integralmente quitadas e com rateios conferidos**. Pendências/adiantamentos não conciliados não entram nos totais da pessoa.
- **Fechamentos ainda é apuração**, não fechamento dominical liquidado e travado.
- Em cascatas (segundo corretor repassa parte ao atendente), uma pessoa pode ter tanto participação a receber quanto outra obrigação de repasse. O sistema mantém as duas contas em separado; o somatório bruto pode incluir transferências entre participantes. Não confundir com lucro líquido do clube.
- Despesas, bonificações, empréstimos, amortizações negociadas, transferências de custódia Pix/conta e PDF oficial do fechamento semanal permanecem pendentes.
- As consultas agrupam por **data da venda**, não por data do pagamento. Pagamentos posteriores de uma venda continuam no extrato daquela venda.
- Consultas de mais de 500 vendas precisam ser divididas em períodos menores.

## Instalação local — PowerShell

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php spark routes
php tests\venda_money_smoke.php
php tests\rateio_rules_smoke.php
php tests\rateio_automatico_smoke.php
php tests\financeiro_saldos_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

Faça backup do banco. Não rode `migrate:refresh`. A migration adiciona somente uma tabela de movimentos; não zera financeiro.

## Testes de aceitação

1. **Layout**: Fechamentos → Definir participações. O campo Observações fica abaixo da função/valor, com mesma largura, borda e foco dos outros campos.
2. **Marta e James**: Em Fechamentos selecione a semana correspondente à venda. Expanda Marta e James, confirme total, pago 0, saldo correto por venda e atendimento.
3. **Pagamento parcial**: em James → Extrato/Pagar, registre um pagamento de R$ 40,00. Verifique R$ 18,80 pendentes e o histórico de pagamentos em Financeiro logado como James.
4. **Parte da Marta**: em Marta → Ver vendas → Registrar pagamento, grave R$ 100,00 com data/descrição. Verifique R$ 311,60 pendentes para Marta e que James mantém os R$ 18,80 de sua conta.
5. **Proteção**: tente marcar pagamento maior que o saldo, estornar duas vezes, alterar um rateio após já pagar o titular: o backend deve negar.
6. **Privacidade**: usuário de James vê apenas comissões e os títulos/IDs das vendas em que participou, sem dados pessoais de associados, valores a pagar aos outros ou extrato da Marta.
7. **Período**: Financeiro filtra por período de venda; Fechamentos exibe totais detalhados e mantém a seção de rateios em separado.
8. **Sem apuração**: venda quitada ainda sem conferência de participantes não deve aparecer como pagamento livre ao corretor. Use Apurar vendas anteriores para resolver.
9. **Build**: execute `npm.cmd run build` e os testes PHP após atualizar. Sem esses resultados, o funcionamento em produção ainda não está confirmado.
