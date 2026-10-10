# SPLASH — Regras automáticas e conferência das participações por venda

## O que mudou

O botão antigo **Regras e ajustes anteriores** foi removido do Fechamento, que continua com quatro etapas. Agora o administrador possui:

1. **Configurações → Regras de comissões**: percentuais padrão, valor do atendimento anual, bônus em venda à vista, exceções por versão de plano, feriados e apuração de vendas pendentes.
2. **Vendas → abrir venda → Conferir / ajustar participações**: distribuição individual entre atendimento, gerência, corretores e justificativa de ajuste.
3. **Financeiro**: continua quebrado por **pessoa e participação**, mostrando o valor que cada pessoa ganhou, recebeu, teve abatido e ainda deve receber.
4. **Fechamentos**: utiliza as mesmas participações já registradas, sem multiplicar ou recalcular valores pagos.

## Padrões para as próximas apurações

Os parâmetros iniciais passam a ser:
- Atendimento em dia útil: **5% do valor de tabela**.
- Atendimento em fim de semana/feriado: **5% do valor de tabela**.
- Gerência quando há gerente na venda: **5% do valor de tabela**, respeitada a exceção já existente de renovação por outro corretor.
- Atendimento em plano de **12 meses**: **R$ 60,00** fixos em lugar dos 5% padrões, antes do adicional.
- Atendimento em venda integralmente **à vista**: **adicional de R$ 10,00**, além do percentual, valor anual ou exceção definida. É aplicado somente quando a modalidade `AVISTA` consta do snapshot da regra da operação.
- Segundo corretor: preservado percentual do saldo (valor cadastrado na política).

Todos os valores podem ser alterados pelo administrador em **Configurações**. Exceção **específica de um plano** tem prioridade sobre o valor padrão de atendimento do plano anual. O adicional à vista soma-se à exceção. Havendo dois atendentes, o total de atendimento (incluindo o bônus) é dividido entre eles, mantendo os centavos corretos.

### Exemplo ilustrativo

Em venda de plano de 12 meses com valor de tabela R$ 1.176,00 e comissão bruta de R$ 392,00:
- Atendimento à vista: R$ 60,00 + R$ 10,00 = R$ 70,00.
- Gerência: 5% de R$ 1.176,00 = R$ 58,80.
- Comissão restante do corretor titular: R$ 263,20, na ausência de outros rateios.

Esses valores são **exemplo**, não lançamentos adicionados ao banco.

## Quando calcular e quando corrigir

A apuração automática dos rateios acontece quando a venda estiver **integralmente quitada** e tiver comissão definida. Uma venda pendente de pagamento não é computada no extrato de comissões como valor confirmado.

No detalhe da venda:
- Os rateios existentes vêm carregados; o administrador pode conferir/corrigir quem recebe, papel, origem, valor, observações e motivo do ajuste.
- A API valida funções cadastradas, impede transferir mais do que a comissão disponível, mantém auditoria do antes/depois e **não gera pagamento**.
- Se há pagamentos ou estornos do titular ou de qualquer participação, o rateio **não pode ser substituído** por esta tela. Correção complementar em fechamento futuro precisa manter histórico.
- Vendas antigas já apuradas **não são recalculadas** ao alterar política; o administrador pode corrigir manualmente antes de pagamentos.
- Um valor ajustado fica gravado na mesma `comissao_rateios` consultada pelo Financeiro e pelo Fechamento. Sem cópias, novos lançamentos ou migração dos valores históricos.

## Persistência e migração

Migration `backend/app/Database/Migrations/2026-10-10-000017_PadraoComissoesSplash.php` adiciona `atendente_um_ano_valor` e `adicional_atendente_avista` em `comissao_politicas`.

Por segurança:
- Apenas a combinação **antiga inicial** (10% em dia útil, 5% nos outros dias) é alterada automaticamente para 5% / 5%.
- Configurações personalizadas diferentes dessa combinação são preservadas; revise os percentuais na tela.
- A migração não altera `comissao_rateios`, pagamentos, estornos, `venda_operacoes` ou fechamentos concluídos.

## Arquivos

- Migration `000017_PadraoComissoesSplash.php`.
- `backend/app/Libraries/RateioAutomatico.php`: cálculo automático.
- `backend/app/Controllers/Api/FechamentosController.php`: parâmetros e consulta read-only de rateios da venda.
- `backend/app/Config/Routes.php`: GET da consulta de participações.
- `frontend/src/pages/RegrasComissoes.jsx` e CSS: configuração centralizada.
- `frontend/src/pages/RateiosVenda.jsx` e CSS: conferência/edição individual.
- `frontend/src/pages/Vendas.jsx`: acesso no detalhe da venda.
- `frontend/src/pages/FechamentosPeriodos.jsx`: remove acesso legado.
- `frontend/src/App.jsx`: abre configurações no módulo novo.
- Testes `backend/tests/comissao_padrao_splash_smoke.php` e `rateio_automatico_smoke.php`; workflow CI atualizado.

## Atualização local

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git checkout main
git pull origin main
cd backend
php spark migrate
php tests\comissao_padrao_splash_smoke.php
php tests\rateio_automatico_smoke.php
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

O CI automatiza compilação e testes puros. Faça conferência funcional no MariaDB local: uma venda nova à vista, uma no cartão e uma venda já apurada antes desta atualização. Nada deve ser baixado como pago durante a conferência.
