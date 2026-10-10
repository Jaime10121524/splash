# SPLASH — Etapa 6: localizar e conciliar Pix antigos por venda

## Onde acessar

**Fechamentos → Fechamentos anteriores → abrir um fechamento CONCLUÍDO → 5. Conciliação do dinheiro recebido → Identificar Pix antigos pelas vendas.**

A nova busca usa os recebimentos já cadastrados nas vendas (`venda_recebimentos`), sem integração bancária e sem criar comissão ou pagamento.

## Regras

- A pesquisa considera somente operações de venda (`situacao=VENDA`) dos corretores que constam no grupo congelado do fechamento.
- Apresenta Pix (`venda_formas_pagamento.codigo=PIX`) com detentor registrado `CORRETOR`, até a data final do fechamento, inclusive vendas antigas.
- Um recebimento totalmente estornado/devolvido não entra na lista de possíveis vínculos. Devoluções e estornos parciais reduzem o valor ainda disponível. A lista é limitada aos 500 Pix mais recentes, com aviso de truncamento.
- **Detentor CORRETOR não garante que James esteja de posse do dinheiro.** Só inclua após conferir o comprovante e confirmar que James realmente mantém o valor.
- Vínculos não mudam `venda_recebimentos`, `venda_operacoes`, o fechamento congelado ou as contas individuais de Marta, Helena e James.
- Recebimento de clube, dinheiro antigo em custódia e repasse aos beneficiários continuam eventos financeiros diferentes.
- Confirmação exige: posse real pelo responsável, ausência de duplicidade e justificativa. No modo NOVO, exige também referência do comprovante.

## Modos de conciliação

1. **Associar ao lançamento existente:** há um Pix já informado na Etapa 5, ativo, deste mesmo fechamento e com o mesmo valor disponível da venda. A conciliação somente vincula origem e custódia; **não soma nada ao saldo novamente**.
2. **Reconhecer Pix ainda não lançado:** após conferir o comprovante e ter certeza de que não está nas entradas do clube, saldo anterior nem em outro registro, cria um único lançamento de `PIX_RETIDO` e o vincula à origem real da venda.
3. **Desfazer vínculo:** exige justificativa; se o valor foi criado por essa conciliação, estorna também o lançamento de custódia, desde que não deixe o caixa negativo. Se era um lançamento manual, só desvincula e preserva o saldo informado anteriormente.
4. O estorno direto de lançamento de custódia ainda associado a um Pix fica bloqueado. Para corrigi-lo, desvincule primeiro.
5. O mesmo recebimento Pix não pode ter dois vínculos ativos, inclusive entre períodos distintos. Os registros estornados permanecem auditáveis; outra confirmação poderá gerar novo vínculo.
6. Se alguém fizer uma devolução/estorno da venda após a conciliação, a consulta apresenta **valor divergente**, para conferência humana; o sistema não inventa transferências corretivas.

### O que não foi automatizado

- Não identifica o detentor **físico** de um Pix pela mera indicação CORRETOR no cadastro.
- Não importa extratos bancários nem valida comprovantes com banco/clube.
- Não concilia automaticamente por igualdade de valor, pois pagamentos distintos podem ter o mesmo valor.
- Não soma dinheiro automaticamente ao abrir a tela.
- Não lança novas comissões ou baixas. Só o pagamento efetivo aos beneficiários quita suas comissões.

## Arquivos

- `backend/app/Database/Migrations/2026-10-10-000016_VinculosPixCustodia.php`
- `backend/app/Controllers/Api/PixCustodiaController.php`
- `backend/app/Libraries/PixConferencia.php`
- `backend/tests/pix_conciliacao_smoke.php`
- `frontend/src/pages/PixVendaCustodia.jsx` e `.css`
- `frontend/src/pages/ConciliacaoCustodia.jsx`
- `backend/app/Config/Routes.php`
- Proteção de estorno: `backend/app/Controllers/Api/ConciliacaoCustodiaController.php`
- Atualização de CI: `.github/workflows/ci.yml`

## Implantação

Faça backup do banco primeiro. Não executar `migrate:refresh`.

```powershell
git pull origin main
cd backend
php spark migrate
php tests\pix_conciliacao_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

## Testes manuais no banco (obrigatórios antes de produção)

1. James administra Marta e Helena; um quarto corretor é independente e não pode consultar ou vincular Pix do grupo.
2. Cadastre Pix da venda da Marta, com detentor CORRETOR. Localize-o e confira que **não entra em caixa sozinho**.
3. Registre manualmente um `PIX_RETIDO` do mesmo valor. Use **Associar ao lançamento existente**: saldo total não aumenta.
4. Localize outro Pix real nunca registrado. Confirme a posse do dinheiro por James e a não duplicidade: valor entra na custódia uma vez, sem alterar a comissão da Marta.
5. Repita a mesma requisição/chave: não duplica. Tente vincular o mesmo recebimento a outro fechamento: bloqueado.
6. Estorne parcialmente um Pix na venda, abra novamente a tela e verifique alerta de valor divergente.
7. Desfaça um vínculo automático, comprovando estorno correspondente; desfaça manual, comprovando que o movimento original continua intacto.
8. Confira proteção contra estorno direto de movimento vinculado e contra desfazer entradas que já bancaram saídas.
9. Teste no celular e verifique o histórico.

**O CI valida sintaxe PHP, build React e testes isolados.** A validação do comportamento transacional depende de um banco MariaDB real no seu ambiente.
