# SPLASH — Minhas Vendas para corretores, vendedores e gerentes

## Interface e navegação

O menu existente **Vendas** passa a abrir **Minhas vendas** para quem está nos grupos Shield `corretor`, `vendedor` ou `gerente`; o administrador mantém a tela completa de Vendas e Pendências.

A página permite buscar pelo número/sigla de título, consultar por data, filtrar a situação da própria comissão, navegar por páginas e abrir um extrato individual. Layout mobile first. A tela individual é **somente leitura** e não dispõe de botões para editar vendas, lançar pagamentos, reajustar comissões, gerar recibos ou visualizar outras pessoas.

## Permissões obrigatórias no backend

A API usa somente `pessoas.user_id` do usuário autenticado pelo Shield e exige permissão `sales.own` junto ao grupo autorizado. Nunca aceita `pessoa_id` da URL/GET como identidade do usuário.

As vendas autorizadas são exclusivamente aquelas em que a pessoa aparece como corretor principal, segundo corretor, atendente, atendente adicional, gerente ou beneficiário de um rateio de comissão. O filtro de participação também se aplica à busca de uma venda por ID; outra venda retorna 404.

**Proibição de dados de terceiros:** não há JOIN com `clientes` na API e a resposta é montada explicitamente com os campos permitidos. Nenhum nome, CPF, endereço, telefone, e-mail, ID de cliente, preço cobrado do cliente, valor bruto da comissão ou comissão e pagamento de outro participante é disponibilizado.

Campos devolvidos: número e sigla do título, datas da venda e de validade, situação booleana de quitação do cliente, papéis da própria pessoa e seus direitos/liquidações/abatimentos/pendências. Não são expostos dados sobre quem pagou aos terceiros.

## Cálculo coerente com o fechamento

- A comissão devida ao titular é a comissão bruta **menos os rateios devidos a terceiros por ele**. Somam-se apenas rateios que a própria pessoa recebe.
- O segundo corretor, vendedor/atendente e gerente têm direitos exclusivamente a partir de seus rateios registrados, não de estimativas inventadas.
- `comissao_titular_movimentos`: pagamentos e estornos da **parcela própria** do corretor titular.
- `comissao_repasses`: pagamentos e estornos dos rateios em que a pessoa é **beneficiária**.
- Pagamentos via `ABATIMENTO_EMP` quitam o direito, mas são classificados como **abatimento de empréstimo**, não transferência de dinheiro.
- Recebimentos de clube ou associados **não** liquidam comissões de pessoas.
- Antes de a venda estar quitada ou a comissão estar apurada corretamente, não é atribuído direito financeiro fictício.
- Uma pessoa pode acumular funções. Seus rateios são somados só uma vez para sua própria conta.
- Valores monetários são calculados em centavos por `VendaMoney`.

## Regra dos fechamentos em andamento

Enquanto a venda pertence a fechamento ainda em andamento, os valores e os movimentos pessoais calculados para aquela operação são retidos na consulta individual; o ID, situação e pagamentos provisórios do fechamento não são divulgados. Somente após o responsável concluir a apuração o usuário poderá visualizar o fechamento e os pagamentos correspondentes. Não afeta a visão administrativa nem o histórico financeiro já registrado.

## Arquivos

- `backend/app/Controllers/Api/MinhasVendasController.php` — API segura e somente leitura;
- `backend/app/Libraries/MinhasVendasConta.php` — cálculo isolado e sanitização do retorno;
- `backend/app/Config/Routes.php` — `GET /api/minhas-vendas` e `GET /api/minhas-vendas/{id}`;
- `frontend/src/pages/MinhasVendas.jsx`, `.css` — tela e extrato;
- `frontend/src/App.jsx` — integração por papel;
- `backend/tests/minhas_vendas_smoke.php` e `.github/workflows/ci.yml` — regressões e validações.

**Nenhuma migration necessária.** Não reinicialize o banco de dados.

## Testes locais de integração (obrigatórios antes de produção)

1. Cadastre vendas com participantes diferentes e respectivos rateios; entre como um vendedor, corretor e gerente. Cada um vê somente sua própria participação.
2. Entre com conta do vendedor e tente `GET /api/minhas-vendas/{id_de_venda_alheia}`: deve retornar 404, sem dados.
3. Abra as ferramentas de rede do navegador: as respostas não podem ter dados pessoais do associado, valores de terceiros nem preço do plano.
4. Quite uma venda; confira comissão de titular líquida de rateios, comissão de segundo corretor, atendimento e gerente.
5. Pague parcialmente, realize abatimento de empréstimo e estorno; confira os saldos e o extrato de cada beneficiário.
6. Faça fechamento com venda associada, sem concluir: para os subordinados não pode aparecer o ID do fechamento nem pagamentos provisórios. Conclua e confira liberação.
7. Faça uma renovação/upgrade: o histórico comercial deve continuar acessível somente às pessoas vinculadas ao novo negócio. A nova comissão não se mistura à venda anterior.
8. Verifique celular e filtros de data/título/paginação.

O CI verifica a sintaxe PHP, os cálculos individuais e a compilação React, mas não substitui os testes de integração no banco MariaDB local.
