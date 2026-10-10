# SPLASH — Conferência opcional de caixa e dinheiro sob custódia

## Objetivo

Fechar o ciclo físico de dinheiro do grupo sem confundir comissão pessoal e caixa sob posse do responsável. O clube envia o dinheiro de todas as comissões a James, mesmo quando a venda é da Marta ou da Helena. James paga os beneficiários. O pagamento do clube a James **não** dá baixa no direito da Marta, da Helena ou de vendedores/gerentes.

A ferramenta aparece somente ao clicar em **Fechamentos → Fechamento concluído → Abrir conferência de caixa**. Não constitui uma quinta etapa obrigatória. O fechamento termina no **Resultado do período** e a conferência de caixa é independente do relatório congelado.

## Fontes automáticas (não lançar outra vez)

- **Recebido do clube:** soma de `fechamento_periodo_entradas` daquele fechamento. Dinheiro fisicamente recebido pelo responsável central, mesmo que atribuído à venda de outro corretor.
- **Pagamentos realizados:** movimentos ativos de `fechamento_periodo_titulares` e `fechamento_periodo_repasses`; ignora a forma interna `ABATIMENTO_EMP`, porque dívida compensada não é dinheiro físico.
- **Nenhum** lançamento cria pagamento pessoal, empréstimo, nova venda ou comissão.

## Lançamentos manuais com comprovação

- **Saldo anterior informado:** dinheiro já sob custódia vindo de antes desse fechamento, quando existir. Só um ativo por fechamento; não há transferência automática do período anterior.
- **Pix/dinheiro retido anteriormente:** recebimento real de cliente ou outra quantia já sob custódia do responsável, ainda não incluída nas entradas do clube. A origem deve ser comprovada.
- **Dinheiro devolvido ao clube:** saída efetiva da posse do responsável, limitada ao saldo apurado disponível. Não é pagamento de comissão.
- Cada registro exige data, valor positivo, referência do comprovante, descrição com pelo menos dez caracteres e chave única anti-duplicação.
- A mesma referência de Pix retido não pode ser usada novamente em outro lançamento ativo do mesmo responsável, inclusive entre fechamentos distintos.
- Erros são corrigidos por **estorno justificado**, nunca exclusão física; o histórico preserva autor e data.
- A autorização do backend restringe o fechamento ao seu responsável ou ao administrador. Membros delegados não visualizam a custódia de terceiros.
- Uma divergência negativa aponta entradas/documentos ausentes. Não cria automaticamente recebimentos fictícios para cobri-la.

## Cálculo (centavos)

`saldo sob custódia = entradas do clube + saldo anterior comprovado + Pix retido informado - pagamentos confirmados - dinheiro devolvido ao clube`.

Exemplo: se o clube enviou R$ 1.662,08 e James registrou pagamentos de R$ 1.424,48, o saldo físico documentado é R$ 237,60, **não** o lucro de James. Despesas pessoais não são abatidas desse caixa automaticamente. A Marta mantém sua comissão individual, com baixas somente quando de fato recebe.

**Atenção:** o sistema não tem acesso ao banco, Pix ou conta do clube; os lançamentos manuais são declaratórios e devem ser conferidos com comprovantes. Não é conciliação bancária automática. Valores antigos sem documentos não devem ser inventados.

## Arquivos

- `backend/app/Database/Migrations/2026-10-10-000015_ConciliacaoCustodia.php` — nova tabela.
- `backend/app/Libraries/ConciliacaoCaixa.php` — soma e diferenciação de caixa, em centavos.
- `backend/app/Controllers/Api/ConciliacaoCustodiaController.php` — consulta, registro e estorno com validações e isolamento.
- `backend/app/Config/Routes.php` — endpoints com CSRF nos POST.
- `frontend/src/pages/ConciliacaoCustodia.jsx` e `.css` — nova tela responsiva.
- `frontend/src/pages/FechamentosPeriodos.jsx` — integração após o relatório.
- `backend/tests/conciliacao_custodia_smoke.php`, `.github/workflows/ci.yml` — testes automatizados.

## Aplicar no ambiente local

Faça backup do banco. Depois:

```powershell
git pull origin main
cd backend
php spark migrate
php tests\conciliacao_custodia_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

**Nunca execute `php spark migrate:refresh`** porque apagaria dados.

## Conferência manual obrigatória

1. Abrir fechamento concluído do grupo James, com Marta e Helena vinculadas.
2. Conferir que entradas do clube e pagamentos ativos aparecem sem cadastro manual; divergências devem ser mostradas.
3. Registrar um Pix retido com referência verdadeira. Verificar aumento do saldo e que nenhuma comissão da Marta foi baixada.
4. Devolver parte do dinheiro ao clube. Verificar diminuição apenas da custódia.
5. Repetir uma requisição com a mesma chave: não pode gerar duplicata.
6. Estornar um valor com motivo e conferir o histórico e os totais; não permitir estornar saldo anterior se isso tornar o caixa negativo.
7. Conferir que outro corretor independente não consegue ler ou escrever a custódia do James.
8. Verificar em Financeiro as contas individuais sem qualquer transferência de titularidade.

O CI valida sintaxe do PHP, build React e o cálculo isolado; não substitui testes integrados no MariaDB com dados reais. A identificação automática de Pix antigos por venda, a importação de extratos bancários e a transferência de saldo entre períodos são etapas futuras: evitamos inferências perigosas.
