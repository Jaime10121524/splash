# SPLASH — Títulos, renovações e upgrades

## Implementação

- Menu **Títulos e renovações** com carteira atual, validade, pesquisa por cliente/número, filtros ativo/a vencer/vencido, histórico e ações de renovação e upgrade (administrador).
- Vários títulos independentes para o mesmo cliente continuam válidos. A carteira mostra **o último movimento de cada cadeia**; operações anteriores ficam no histórico.
- Corretores podem ver a validade de títulos vinculados à sua pessoa, sem receber dados de clientes ou informações financeiras de terceiros. Somente o administrador cria movimentos.

## Renovação

1. Selecione o título vigente e escolha **Renovação**.
2. Selecione uma versão ativa da mesma família de plano. O número individual do título permanece igual, mesmo que a sigla da versão tenha mudado.
3. Se ainda estiver válido, o novo período começa a partir do vencimento anterior. Se estiver vencido, começa na data da nova operação.
4. O prazo da versão nova é adicionado integralmente. A cobrança da renovação utiliza o preço atual do plano novo, menos eventual desconto concedido e registrado.
5. A renovação gera uma nova operação `VENDA`, independente em recebimentos, comissão e fechamento. A venda anterior continua intocada.

## Upgrade

1. Selecione um título vigente e escolha **Upgrade**.
2. A versão de destino deve ter preço integral de tabela maior que o preço integral da versão anterior.
3. A nova venda cobra **somente a diferença entre os preços de tabela das duas versões**, menos eventual desconto específico do upgrade. Não reembolsa, estorna nem reutiliza os recebimentos da venda original.
4. O vencimento novo considera o maior prazo entre o vencimento já adquirido e a data inicial do título original + a duração do plano superior. Nunca reduz a validade anterior.
5. Para um título já vencido, deve-se realizar uma renovação antes de fazer o upgrade, evitando cobrar diferença por uma vigência expirada.
6. O plano anterior deixa de ser **o título vigente**, mas a operação original permanece `VENDA` para manter todas as comissões/fechamentos históricos. A substituição é identificada pelo vínculo, não pela remoção da venda.

**Exemplo de diferença:** título de R$ 1.000,00 para título de R$ 1.850,00: nova cobrança de R$ 850,00 antes de descontos. Não transferir comissão ou pagamentos do título anterior para essa cobrança.

## Ativação somente após quitação

A nova validade de uma renovação/upgrade é **provisória até a quitação da nova cobrança**. O cliente conserva os direitos de validade do título anterior enquanto existir saldo pendente na nova venda. A carteira marca a nova operação como **Aguardando pagamento**, mostra a validade anterior e a nova validade prevista e permite abrir a nova venda para receber.

Depois do recebimento integral, a carteira muda automaticamente para a validade do novo plano. Pagamento parcial não ativa antecipadamente o prazo novo e não dispara comissão. A operação de origem continua protegida para impedir duplicidades.

## Histórico e proteção financeira

- `titulo_vinculos` possui índice único em origem e destino: não permite que uma mesma operação tenha dois sucessores nem duas origens.
- `venda_operacoes.titulo_sequencia` mantém a identidade da numeração `numero_titulo + sigla_plano` mesmo quando a renovação utiliza a mesma sigla. A venda original tem sequência 0 e conserva a regra de unicidade original; sucessoras têm sequência interna maior.
- Renovação/upgrade exigem quitação integral da cobrança anterior, cliente ativo, versão nova válida, justificativa e responsável/participantes com papéis compatíveis.
- O processo é transacional. Antes de vincular, a operação original é bloqueada `FOR UPDATE` para impedir movimentos simultâneos, e a gravação só é confirmada com venda nova + vínculo.
- Venda original vinculada não permite alterar cadastros, valores do cliente ou estornar seus recebimentos. Vendas que já estão em fechamentos também permanecem imutáveis.
- A edição de plano/preço/validade da operação sucessora é bloqueada. Pode-se registrar recebimentos e ajustes de comissão na nova venda pelo fluxo normal.
- Uma renovação/upgrade **não paga comissão**. Ao receber o valor completo da nova venda, a mesma apuração automática e rateio do SPLASH se aplicam àquela operação. Fechamentos anteriores não são reabertos.
- Desconto é exclusivo da nova venda e segue as regras normais de desconto de comissão.
- A interface mostra a data prevista, mas **o servidor é a fonte definitiva** para o cálculo.

## Arquivos e rotas

- Migration: `backend/app/Database/Migrations/2026-10-11-000018_TitulosRenovacoesUpgrades.php`.
- Biblioteca: `backend/app/Libraries/VigenciaTitulo.php`.
- Controller: `backend/app/Controllers/Api/TitulosController.php`.
- UI: `frontend/src/pages/Titulos.jsx`, `Titulos.css`.
- Vendas: proteção de vínculo em `VendasController.php` e tela `Vendas.jsx`.
- Reset de dados de teste atualizado para excluir `titulo_vinculos` na ordem de FK.
- Testes: `backend/tests/titulos_renovacoes_smoke.php`.

GET `/api/titulos`, GET `/api/titulos/opcoes`, GET `/api/titulos/{id}/historico`, POST `/api/titulos/{id}/movimentar` (CSRF).

## Atualização local

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git checkout main
git pull --ff-only origin main
cd backend
php spark migrate
php tests\titulos_renovacoes_smoke.php
cd ..\frontend
npm.cmd run build
```

Não executar `migrate:refresh` nem resetar o banco. Uma migration normal adiciona coluna e tabela, preservando todas as vendas anteriores.

**Teste de integração pendente no MariaDB local:** conferir cenário de título novo, renovação antes de vencer, renovação vencida, upgrade, pagamentos parciais/integrais, fechamento da nova venda, bloqueio de origem já substituída e acesso por corretor. GitHub CI valida sintaxe e regras isoladas, não substitui esses testes reais.
