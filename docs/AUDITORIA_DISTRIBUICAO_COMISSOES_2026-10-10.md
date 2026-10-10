# SPLASH — Conferência da distribuição das comissões por venda

## Objetivo

Permitir ao responsável comparar a comissão **bruta** das vendas de um Fechamento com os valores **individuais** que compõem o Financeiro, sem transformar a conferência em uma nova etapa do fluxo e sem alterar a tela Financeiro, que continua quebrada por pessoa.

Acesse **Fechamentos → abrir um Fechamento concluído → Resultado do período → Conferir divisão das comissões por venda**. O botão só carrega dados quando clicado. Não usa a conferência de caixa/Pix, retirada da interface anteriormente.

## Exemplo de distribuição

Venda da Marta com comissão bruta de R$ 600,00, com rateios reais para:
- James: Atendimento, R$ 120,00;
- Helena: Gerência, R$ 120,00;
- Marta: Comissão própria, R$ 360,00.

A soma das **três participações** fecha em R$ 600,00. O recebimento centralizado do clube pelo James não transfere a comissão da Marta para ele. Pagamentos já realizados aparecem separadamente e não criam novos direitos.

## Regras de auditoria

- A consulta busca exclusivamente operações já vinculadas ao Fechamento e pertencentes ao responsável autenticado ou administrador.
- O cálculo reproduz a distribuição por venda do Financeiro: parte própria do titular = comissão bruta − rateios cujo responsável é o titular; créditos de beneficiários = todos os rateios registrados na venda.
- Se o total dos créditos for diferente da comissão bruta, o sistema sinaliza discrepância, incluindo rateio cadastrado com responsável diferente do titular.
- Se rateios excederem a comissão ou algum pagamento for maior que o direito, sinaliza **revisar**, sem alterar registros.
- Uma venda só é apta a constar no extrato do Financeiro quando está com situação VENDA, quitada integralmente e comissão definida; sem apuração automática aprovada ou rateios registrados, fica aguardando apuração. Essas diferenças de critério **não são** necessariamente falhas de pagamento.
- A listagem geral do Financeiro considera somente as 500 vendas mais recentes no período pesquisado. Estar marcada como APTA não garante que uma venda fora desse limite seja exibida no extrato daquela consulta.
- Os dados refletem o estado **atual** dos lançamentos de comissão e pagamentos. O relatório congelado de um Fechamento CONCLUÍDO continua inalterado.
- Este recurso é de leitura: não lança pagamentos, não corrige automaticamente rateios, não mexe no caixa nem altera saldos pessoais.

## Arquivos

- `backend/app/Libraries/AuditoriaRateios.php`: comparação aritmética pura em centavos.
- `backend/app/Controllers/Api/FechamentosPeriodosController.php`: rota de consulta restrita ao escopo do responsável.
- `backend/app/Config/Routes.php`: GET `/api/fechamentos-periodos/{id}/auditoria-rateios`.
- `frontend/src/pages/AuditoriaRateios.jsx` / `.css`: tela de auditoria responsiva.
- `frontend/src/pages/FechamentosPeriodos.jsx` / `.css`: botão opcional no relatório concluído.
- `backend/tests/auditoria_rateios_smoke.php`: teste da divisão de R$ 600 e de rateios divergentes.
- `.github/workflows/ci.yml`: inclui o teste na validação.

## Atualizar localmente

Não há migration nesta etapa.

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git checkout main
git pull origin main
cd backend
php tests\auditoria_rateios_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

## Teste manual recomendado

1. Abra um fechamento concluído com uma venda de comissão dividida; confirme que os beneficiários exibidos são exatamente os de `comissao_rateios`.
2. Confira a soma da comissão própria mais participações: deve coincidir com a comissão bruta para rateios corretos.
3. Compare os mesmos beneficiários e a mesma venda em **Financeiro → Comissões por pessoa**, com período adequado e respeitando o limite de vendas.
4. Confira uma venda ainda não quitada; deverá ser identificada como não apta a constar no Financeiro, em vez de apresentar falsa diferença.
5. Acesse com corretor delegado e vendedor: a consulta de outro responsável deve ser bloqueada.
6. Verifique que nada foi inserido ou alterado no banco durante a conferência.

**Observação:** a validação com lançamentos reais depende do banco MariaDB local. O CI valida sintaxe PHP, build React e cenários aritméticos isolados; não substitui a conferência em banco.
