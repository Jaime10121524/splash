# SPLASH — Requisitos de negócio (versão inicial)

Este documento reúne regras definidas em conversa. Não tornar valores, códigos, condições ou percentuais rígidos na aplicação.

## Perfis, visibilidade e operacional
- Um clube; múltiplos usuários com **nome de usuário e senha**, recuperação de senha via e-mail.
- **Administrador único:** acesso global, configuração, revisão, fechamentos, recebimentos e todos os pagamentos.
- **Corretores (incluindo mãe e esposa):** acesso às próprias comissões líquidas, receitas, empréstimos/amortizações e despesas; sem visualizar repartição/valores de vendedor, gerente, outros corretores ou dados financeiros de terceiros.
- **Vendedores:** somente suas vendas, seus pagamentos e comissões, **sem dados pessoais do associado**.
- Gerentes e outros grupos/permissões cadastráveis; aplicar verificação também no backend.
- O administrador faz o fechamento das vendas próprias, da mãe e da esposa, recebe todos os recursos e paga corretores, gerentes, vendedores e repassa os saldos. Os titulares financeiros continuam independentes; proibir compensação cruzada entre mãe/esposa/administrador.

## Cadastros
- **Clientes:** nome, telefone, CPF, e-mail, nascimento, endereço, observações, profissão.
- **Planos:** código alfanumérico livre (ex.: `1567 P/T` → `1567 R/T`), valor, prazo em meses/anos, status e versões por reajuste; cada venda preserva sua versão e preço. Exemplos históricos 1/5/6/10/15 anos, sem fixar opções no código.
- **Pessoas:** um usuário/pessoa pode acumular os papéis de corretor, vendedor e gerente; participantes sem conta de acesso também devem existir.
- **Origens:** lead de anúncio, indicação, renovação, outro; cadastro configurável.
- **Categorias:** despesas, bonificações, motivos de não venda, feriados, status e formas de pagamento configuráveis.
- **Corrente:** dono da corrente pode ser diferente do corretor vendedor/indicante; indicação segue o dono da corrente de origem. Na operação descrita, correntes de vendas da mãe ficam com o administrador.

## Atendimento e visitas
- Cadastro rápido por nome e telefone ao chegar; data/hora de chegada, iniciar atendimento, mudanças de status e encerramento com timestamps automáticos.
- Acompanhar tempo mínimo/máximo/médio de atendimento e taxa de conversão; separar número de visitas e visitantes únicos.
- Cliente pode visitar novamente; nos retornos mantém o mesmo atendente segundo regra informada.
- Atendimentos eventualmente compartilhados por dois vendedores, com divisão da comissão de atendimento.
- Motivo de não compra configurável; retorno agendado e alertas.

## Vendas, títulos, renovações e upgrade
- Um cliente pode ter vários títulos cujos prazos **se somam**.
- Venda normal: validade começa na data da venda.
- Renovação: acrescenta duração ao vencimento anterior, preservando venda original no histórico.
- Upgrade: venda de plano maior por diferença financeira e cancelamento/substituição do título inicial, preservando rastreabilidade.
- Desconto à vista concedido ao cliente reduz a comissão do corretor responsável, nunca a parcela pertencente ao clube.
- Parcelamento do cliente somente no cartão. Formas de pagamento cadastráveis: PIX, dinheiro, crédito, débito, transferência (não precisar iniciar com boleto/cheque).
- Sem anexos de comprovantes no escopo inicial.

## Comissão e distribuição
- Histórico: à vista antiga **1/3** do plano; à vista atual **40%** (vigências configuráveis).
- Na regra informada para cartão, comissão-base **1/3**, com **8% de desconto sobre o saldo da comissão que o clube ainda vai repassar**, depois de considerar os valores do cliente retidos pelo corretor e destinados à comissão.
- Exemplo de fechamento misto: plano R$ 1.000; comissão-base R$ 333,33; R$ 200 de PIX recebidos pelo corretor; saldo R$ 133,33; desconto 8% = R$ 10,67; clube paga R$ 122,66; total retido/recebido R$ 322,66.
- Exemplo quando retenção PIX > comissão: corretor recebeu R$ 500; comissão-base R$ 333,33; repassa **R$ 166,67** ao clube no fechamento, sem aplicar 8% sobre saldo inexistente.
- Essas fórmulas devem ser versionadas/configuráveis. Critérios e ajustes de arredondamento manual devem ficar registrados; valor final do clube pode ser corrigido.
- Atendimento: normalmente 5% do valor do plano, ou 10% em dias úteis (seg–sex menos feriados cadastrados).
- Gerente: 5% do valor do plano quando aplicável; exceções para dias úteis e renovação de outro corretor.
- Corretor atendendo cliente próprio: não cobra atendimento extra; atendendo cliente de outro corretor pode receber atendimento desse titular.
- Divisão de uma venda entre dois corretores: normalmente 50/50 após as despesas de atendimento/gerência que incidirem, com possibilidade de um corretor assumir sozinho esses custos. Sem necessidade de percentuais livres de divisão entre corretores.
- Um vendedor pode dividir atendimento com outro. Custos de terceiros são obrigações individuais de seu responsável.
- Comissão adiantada em pendência **não pode ser novamente paga** ao virar venda.

## Pendências, devoluções e encerramento
- Pendência pode receber múltiplos pagamentos de formas e datas diferentes; cada pagamento registra recebedor e beneficiário/obrigação.
- Ao concluir, vincular à venda definitiva e compensar valores/comissões já movimentados.
- Prazo de revisão configurável, sugerido 60 dias: alerta; não devolve nem encerra automaticamente.
- Em devolução ao cliente, devolve quem recebeu/está com o dinheiro; os participantes que receberam comissões devem restituir suas partes. Débitos não devolvidos podem ser compensados em próximas comissões do mesmo responsável, sem apagar históricos.
- Encerrada sem devolução e sem venda: quando o valor ficou com o corretor, o valor já distribuído permanece com os participantes; se ficou com o clube, não há comissão automática, salvo exceção registrada/autorizada.
- Reabertura de pendência permitida com trilha de auditoria. Retenção precisa corresponder a contrato e lei aplicável.

## Caixa, contas-correntes e fechamento
- Registrar separadamente recebimento de cliente, comissão devida, antecipação, pagamentos de terceiros, repasses, estornos e transferência entre contas.
- Contas financeiras (dinheiro, PIX, banco) e transferências internas (depósito de dinheiro em conta **não é receita**).
- Despesas totalmente próprias de cada corretor, categorizáveis; não são reembolsáveis pelo clube nem parceladas.
- Empréstimos apenas com o clube, normalmente sem juros; abatimento negociado e inserido **manualmente** em cada fechamento, podendo ser zero.
- Fechamento acionado **manualmente** (geralmente domingo), com extratos por titular e consolidado administrativo. Não confundir apurar saldo com quitação; registro de pagamentos e saldos parciais.
- Possibilidade de corrigir/estornar fechamento com justificativa e histórico.
- Saldos iniciais individuais configuráveis; relatórios em **PDF somente**.

## Importação e notificações
- Importar CSV gerado a partir de fotos antigas; regras antigas aplicadas e dados aproximados conforme registro encontrado.
- Vendas históricas não devem criar automaticamente débitos exigíveis ou repetir pagamentos já feitos; distinguir registros históricos de saldos pendentes informados separadamente.
- Alertas de renovação com antecedência configurável (ex.: 30/60/90 dias) e contato por WhatsApp.

## UI e implantação
- SPA mobile first, visual inspirado em AHRIFLOW/AHRIPESCA/AHRIBIO, sem reaproveitar o código desses sistemas sem inspeção.
- Inicialmente sempre online. PWA, depois Capacitor/APK.
- XAMPP local e HostGator/cPanel em produção. Nunca publicar `.env`, `vendor` como pasta aberta, logs ou dumps de banco.
