# SPLASH — Relatório de Acerto Semanal

## Primeiro relatório implantado

**Menu:** Relatórios → Acerto semanal.

O relatório usa os fechamentos já registrados, somente depois de concluídos. Não cria, altera, paga ou estorna lançamentos. A interface é responsiva e oferece **Imprimir / Salvar PDF** pela janela de impressão do navegador.

### Acesso do administrador

O administrador pode consultar os fechamentos concluídos de todos os responsáveis do sistema, com:
- Período e responsável;
- Comissões brutas e respectivas divisões por venda;
- Direitos, valores liquidados, recebidos em dinheiro, abatidos e pendentes **separados por beneficiário**;
- Entradas do clube, pagamentos registrados, despesas e saldo das entradas (informações gerenciais, não saldos bancários);
- Vendas e participantes sem compensar a conta de um titular com a de outro;
- Impressão A4/PDF.

**Distinção contábil:** entrada do clube não significa que um beneficiário recebeu a comissão. Abatimento de empréstimo reduz seu direito, mas não representa transferência de dinheiro. Um fechamento concluído com saldo pendente continua mostrando esse saldo a receber.

### Visibilidade de pessoas vinculadas

Vendedor, gerente e corretor com acesso habilitado em Shield (`reports.own`):
- Só veem a lista de períodos **CONCLUÍDOS** nos quais possuem direito de titular ou participação;
- Não veem fechamentos em andamento;
- A pessoa é identificada pelo `pessoas.user_id` do usuário autenticado, **nunca por parâmetro recebido do navegador**;
- Recebem somente os lançamentos de comissão de sua própria pessoa;
- Não recebem os clientes, nomes de outros participantes, valores do clube ou dados de terceiros;
- Corretores também visualizam apenas despesas e empréstimos próprios do snapshot, quando existentes;
- Podem imprimir/salvar PDF do demonstrativo individual.

O filtro é obrigatório **no backend** para ambos os endpoints, inclusive se alguém tentar digitar um ID de fechamento de outra pessoa.

No menu **Fechamentos**, um corretor delegado (que não pode abrir um período independente) é direcionado à própria consulta de demonstrativos concluídos, em vez de visualizar botões de abertura de fechamento; corretores independentes mantêm o fluxo tradicional.

### Arquivos

- `backend/app/Controllers/Api/RelatoriosController.php`: filtros de status, vínculo do usuário e escopo;
- `backend/app/Libraries/RelatorioAcertoSemanal.php`: cálculos por pessoa a partir dos mesmos movimentos financeiros gravados no sistema;
- `backend/app/Config/Routes.php`: duas rotas GET;
- `frontend/src/pages/Relatorios.jsx` e `.css`: interface e modo impressão;
- `frontend/src/App.jsx` e `frontend/src/pages/FechamentosPeriodos.jsx`: navegação integrada;
- `backend/tests/relatorio_acerto_semanal_smoke.php`: teste de centavos, estorno, abatimentos e sigilo;
- `.github/workflows/ci.yml`: smoke no pipeline.

### Rotas

```text
GET /api/relatorios/fechamentos
GET /api/relatorios/fechamentos/{id}/acerto
```

O primeiro endpoint aceita `inicio=YYYY-MM-DD&fim=YYYY-MM-DD`; sem filtros lista os últimos 150 fechamentos concluídos aos quais a pessoa pode ter acesso.

### Verificações recomendadas no MariaDB local

1. Abrir fechamento pelo administrador, sem concluir: o usuário vinculado não o vê em seus relatórios.
2. Concluir o fechamento: ele passa a aparecer para o usuário vinculado quando houver comissão própria ou participação.
3. Entrar como Helena ou Marta: verificar somente linhas próprias de comissão, abatimentos e despesas/empréstimos próprios; nenhum valor financeiro de James ou da outra corretora.
4. Entrar como atendente/gerente: verificar somente suas participações e respectivos pagamentos.
5. Como admin, conferir totais e divisão por venda e imprimir em PDF.
6. Tentar acessar via URL um fechamento de terceiro com conta não administradora: deve retornar 404 sem dados.
7. Verificar diferença entre recebimento do clube e pagamento efetivo de comissão.

**Nenhuma migration de banco é necessária nesta etapa.**
