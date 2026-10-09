# SPLASH — Diretrizes do modelo de dados

Documento de arquitetura inicial: tabelas definitivas virão em migrations do CodeIgniter 4.

## 1. Identidade e cadastros
| Entidade | Responsabilidade |
|---|---|
| `users`, `auth_*` (Shield) | Autenticação; grupos e permissões |
| `pessoas`, `pessoa_papeis` | Corretor, atendente, gerente, com ou sem usuário |
| `clientes` | Dados pessoais, acesso restrito |
| `planos`, `plano_versoes` | Cadastro estável e versões de código, preço e prazo |
| `origens_leads`, `motivos_nao_venda` | Cadastros configuráveis |
| `correntes`, `corrente_historico` | Dono da corrente e atribuições históricas |
| `calendario_feriados` | Dias não úteis para comissão de atendimento |

## 2. Atendimento e negócios
| Entidade | Responsabilidade |
|---|---|
| `visitas`, `visita_atendentes` | Chegada, início, término, duração, atendentes |
| `negociacoes` | Processo unificador: aberta, pendente, concluída, encerrada |
| `negociacao_participantes` | Papéis e responsáveis financeiros por negociação |
| `recebimentos_clientes` | Cada PIX/dinheiro/cartão, recebedor real e destinação |
| `vendas`, `titulos` | Venda definitiva, versão de plano, validade, titular |
| `venda_vinculos` | Renovação ou upgrade ligado à venda anterior |
| `regras_comissao` | Configuração por vigência, modalidade, dias e exceções |
| `comissoes` | Apuração por pessoa; snapshot da fórmula e ajustes |

A venda deve preservar preço, código, duração, regra e parâmetros efetivamente usados. Não recalcular períodos antigos ao editar cadastros.

## 3. Financeiro: modelagem em razão
| Entidade | Responsabilidade |
|---|---|
| `contas_financeiras` | Caixa, banco, PIX; pertencimento e responsável |
| `movimentos_contas` | Entrada, saída e transferência efetiva de dinheiro |
| `obrigacoes_financeiras` | Créditos/débitos por titular e contraparte; origem da obrigação |
| `liquidacoes_financeiras` | Valores quitados ou compensados parcial/totalmente |
| `emprestimos`, `emprestimo_amortizacoes` | Dívidas com o clube, baixas negociadas |
| `despesas`, `categorias_despesa` | Gastos pessoais do titular |
| `fechamentos`, `fechamento_itens` | Acerto por período com apurações por titular |
| `auditoria_eventos` | Mudanças, estornos, justificativas e usuário autor |

### Distinções obrigatórias
- **Titular da comissão:** quem tem direito ao resultado.
- **Recebedor físico do dinheiro:** quem tem posse de um recebimento.
- **Responsável pelo pagamento:** quem transfere o valor a terceiro.
- **Contraparte:** clube, corretor, vendedor ou outro participante.
- **Resultado** não equivale ao saldo de caixa; empréstimos e transferências internas não são receitas de comissão.
- Fechamento administrativo consolida informações, mas **não mistura saldos** de titulares diferentes.
- Cada centavo pago, antecipado ou estornado tem origem e liquidação própria. Nunca pagar novamente uma comissão já quitada em pendência.
- Toda operação financeira deve ser transacional e idempotente quando criada por importação/integração.
- Dinheiro: MySQL `DECIMAL(15,2)`, nunca `float`; valores negativos e estornos devem ser representados com tipos de movimento bem definidos.
- Acesso limitado por pessoa e escopo; ocultar dados na UI **não substitui** autorização na API.

## 4. Ordem técnica sugerida para migrations
1. Identidades/pessoas e papéis; preparar grupos/permissões do Shield.
2. Clientes, planos e versões, correntes e origens.
3. Visitas, negociações, status e participantes.
4. Vendas, títulos, renovação, upgrade, recebimentos.
5. Comissão parametrizada e snapshots por venda/participante.
6. Livro razão financeiro, contas, empréstimos, despesas.
7. Fechamento/liquidações, auditoria, importação e relatórios.

## 5. Segurança e importação
- Segredos somente em `.env` não versionado. Senhas geridas pelo Shield; não criar hashes próprios.
- Backoffice administrativo separado de recursos acessíveis a corretores/vendedores.
- Nas vendas antigas, preservar valor informado e situação `HISTORICO` quando não houver conciliação; não criar saldo em aberto automaticamente.
