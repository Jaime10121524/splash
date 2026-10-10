# SPLASH — Fechamentos independentes e corretores administrados

## Regra principal
Cada corretor é independente por padrão. Somente os vínculos feitos pelo administrador em **Fechamentos → Responsabilidades** permitem agrupar as vendas de outro corretor.

Exemplo: vincule Marta e Helena a James. O fechamento James agrupa somente James, Marta e Helena, com comissões, empréstimos e despesas separados por titular. Outro corretor sem vínculo faz seu próprio fechamento, pelo seu login Shield, sem visualizar vendas ou valores do grupo James. **Dono da corrente do cliente NÃO é responsabilidade financeira**.

Somente administrador cadastra vínculos e não são permitidos grupos em cascata. O sistema congela as pessoas e vendas de cada fechamento; alterações futuras de responsabilidades não mudam o histórico. Nem um corretor comum consegue escolher outro responsável usando a API.

## Etapas

1. **Novo fechamento:** escolha período inicial/final e responsável (admin); corretor comum usa automaticamente sua pessoa vinculada ao login.
2. **Recebimentos:** confira vendas do grupo e registre quanto entrou efetivamente do clube, forma (ex.: R$ 200 dinheiro e R$ 3.000 Pix) e beneficiário correto. Inclua abatimentos negociados de empréstimos do titular, sem contá-los como dinheiro recebido.
3. **Repasses:** primeiro registre a parte própria da comissão de cada corretor (inclusive Marta e Helena), depois as participações de atendentes, gerentes e segundos corretores. É possível pagar parcialmente ou com múltiplas formas. Cada baixa afeta a venda original e o extrato da pessoa; estornos antes da conclusão exigem justificativa.
4. **Conclusão e histórico:** confira por pessoa o total, já recebido, recebido neste fechamento, repasses, despesas, abatimentos e resultado gerencial estimado. Concluir congela o relatório, disponível no histórico. Para obter PDF use **Imprimir → Salvar como PDF** no navegador.

Atenção: dinheiro antigo retido pelo corretor que pertence ao clube não é conciliado automaticamente nesta versão. Portanto o valor a receber e o resultado líquido ainda são **estimativas** até conciliar a custódia anterior. Despesas não são consideradas saída do caixa do fechamento sem pagamento registrado.

## Segurança e integridade

- Responsabilidades explícitas: nenhum usuário é agrupado apenas por trabalhar no mesmo clube.
- Venda é vinculada a somente um fechamento, com índice único. Mesmo responsável não pode criar períodos sobrepostos.
- Leitura de históricos de outros corretores independentes retorna 403 para usuários comuns.
- Chave de requisição evita entradas, abatimentos e repasses duplicados.
- Rascunhos podem ter recebimentos retirados ou abatimentos desfeitos antes de avançar.
- Pagamentos a atendentes e demais participantes usam comissao_repasses; pagamentos da parte própria dos corretores usam comissao_titular_movimentos. Todas as formas de pagamento e estornos ficam auditáveis. Sem baixas fictícias.
- Abatimento de empréstimo lança tanto a amortização da dívida quanto a quitação equivalente na comissão própria da pessoa, marcada com forma interna, sem saída financeira.
- Finalizado tem resumo congelado, com histórico acessível.

## Implantação

Nova migration: 2026-10-10-000014_FechamentosPeriodos.php

Novos arquivos: API FechamentosPeriodosController.php, frontend FechamentosPeriodos.jsx e .css, biblioteca FechamentoEscopo.php e smoke test fechamentos_escopo_smoke.php.

Faça backup antes de migrar. **Não execute migrate:refresh.**

~~~powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php tests\fechamentos_escopo_smoke.php
php tests\financeiro_emprestimos_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
~~~

## Verificação obrigatória

Cadastre quatro corretores: James, Marta, Helena e um quarto independente. Vincule os dois do grupo a James, mantendo o quarto sem vínculo. Confira que James só fecha o grupo, o quarto só fecha a própria operação, e que tentar abrir o período de James com login do quarto retorna 403.

Depois simule um fechamento com duas entradas (Pix e dinheiro), uma amortização de empréstimo e pagamento parcial a atendente. Confira saldos, histórico, formas e relatório concluído no banco MariaDB local. O CI do GitHub valida sintaxe PHP, regras de isolamento e build React, mas não substitui esse teste de integração com o banco.

## Próximos limites

Conciliação de carteira (Pix em poder do corretor/valores pertencentes ao clube), antecipações de pendências e geração de PDF diretamente no servidor continuam separados. O relatório atual pode ser salvo como PDF pela impressão do navegador.
