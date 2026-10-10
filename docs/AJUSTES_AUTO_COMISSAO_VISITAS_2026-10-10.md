# SPLASH — Comissão automática, estornos e vínculo atendimento/venda

Implementação publicada na branch main. Verifique migrations e build localmente antes de usar valores reais.

## Mudanças

1. **Estornar lançamento**: o modal lista apenas recebimentos originais com saldo ainda disponível para estorno. Uma entrada integralmente estornada ou devolvida permanece no extrato, mas desaparece da seleção de estornos. O back-end continua verificando saldos e impedindo estorno repetido.
2. **Comissão automática**: retirada a seleção da regra do formulário de venda e edição. O usuário cadastra o plano, desconto se houver e os pagamentos reais. O sistema escolhe a comissão assim que a soma dos recebimentos líquidos alcançar o valor cobrado. Antes disso, exibe `Após quitação`, e não trata a modalidade como definitiva.
3. **Regra à vista atual**: usa a regra configurada em Configurações -> Aplicação (inicialmente 40%). **Venda histórica** à vista usa 1/3, sem inventar o momento exato da transição. Crédito integral usa 1/3 com desconto de 8% sobre a comissão. Misto utiliza 1/3 sobre o preço tabelado, deduzindo 8% somente do saldo da comissão após a entrada não cartão.
4. **Regras editáveis**: em Vendas -> Configurações -> Aplicação, as quatro situações `AVISTA_ATUAL`, `AVISTA_HISTORICA`, `CARTAO` e `MISTO` podem ser vinculadas a qualquer regra compatível cadastrada. Cada operação nova guarda um snapshot das quatro opções; edições posteriores não afetam taxas já assumidas naquela operação.
5. **Desconto opcional**: a caixa de desconto concedido ao cliente só aparece se a opção for marcada. Sem desconto, o valor é zero automaticamente.
6. **Venda na visita**: Atendimentos informa se há venda ou pendência financeira vinculada, mostrando número e sigla do título. No administrativo, `Ver título` ou `Ver pendência` abre o extrato correspondente. Somente quando não há operação aparece `Registrar título`, evitando duplicação.

## Como a regra é identificada

- Só pagamento em Pix, dinheiro ou outra forma **não crédito** (incluindo débito e transferência): à vista.
- Só cartão de crédito: cartão.
- Crédito + outra forma: misto.
- Pagamento parcial: aguardando quitação; a modalidade ainda pode mudar.
- Estorno ou devolução que deixa pagamento incompleto: volta a aguardar quitação, conservando o histórico.
- Valores **não cartão** acima de 1/3 no misto podem exigir conferência manual: não atribuímos comissão arbitrária onde a regra negociada não está definida.
- A comissão é **estimada**, não uma quitação de comissão, e não gera repasse aos corretores/atendentes nem devolução à empresa automaticamente.

## Exemplos

| Plano | Pagamento | Venda histórica? | Comissão prevista |
| --- | --- | --- | --- |
| R$ 1.000,00 | Pix R$ 1.000,00 | Não | R$ 400,00 |
| R$ 1.000,00 | Pix R$ 1.000,00 | Sim | R$ 333,33 |
| R$ 1.000,00 | Crédito R$ 1.000,00 | Não | R$ 306,66 |
| R$ 1.000,00 | Pix R$ 200,00 + crédito R$ 800,00 | Não | R$ 322,66 |
| R$ 1.176,00 | Pix R$ 360,00 + crédito R$ 816,00 | Não | R$ 389,44 |
| R$ 1.176,00 | Pix R$ 360,00, sem restante pago | Não | Após quitação |

## Banco

Nova migration `2026-10-10-000007_SelecaoAutomaticaComissao.php`:
- Tabela `venda_regras_aplicacao` com as associações por modalidade
- Campo `venda_operacoes.regras_automaticas_snapshot` para congelar as regras vigentes
- Não apaga registros, não altera os valores antigos já lançados automaticamente; operações anteriores passam a usar a associação automática nas próximas movimentações. Operações com comissão manualmente ajustada preservam o ajuste.

## Atualizar

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php tests\venda_money_smoke.php
cd ..\frontend
npm.cmd run build
```

Não use `migrate:refresh`. Faça backup se já houver dados reais.

## Testes

1. Estorne integralmente a entrada Pix #1: não deverá aparecer novamente no seletor de estorno; continuará visível no histórico.
2. Cadastre uma venda à vista e lance o Pix integral: não escolha regra; comissão aparece automática após quitação.
3. Lance R$ 200 no Pix e depois R$ 800 no cartão em plano R$ 1.000: após o segundo recebimento, comissão R$ 322,66.
4. Lance uma entrada parcial: comissão informa `Após quitação`; o valor do cliente que falta pagar continua no extrato.
5. Em Atendimentos, veja o título vinculado e clique `Ver título`; abre o extrato já existente, sem criar outra venda.
6. Configure em Vendas -> Configurações -> Aplicação uma regra compatível e confirme que só afeta novas operações.
7. Verifique comissões históricas com `Cadastro histórico` marcado.

## Observação sobre o teste no repositório

O teste de cenários foi adicionado ao `backend/tests/venda_money_smoke.php`, porém ainda precisa ser executado no XAMPP, assim como o build React. Não declarar compilação confirmada sem execução.
