SPLASH — Cadastro de planos (primeiro módulo funcional)

IMPLEMENTADO
- Menu Planos exclusivo do administrador.
- Tabelas planos (identificador estável) e plano_versoes (código, valor, prazo em meses, ativo, início de vigência opcional).
- Novo plano, nova versão/reajuste, filtro por situação, pesquisa, ativação e inativação.
- Versões anteriores permanecem no histórico; novo reajuste ativo desativa a versão anterior do mesmo plano.
- API com verificação de sessão e permissão administrativa no backend; POSTs protegidos por CSRF.
- Não há planos ou valores fictícios pré-cadastrados.

INSTALAÇÃO LOCAL
Na raiz do SPLASH, execute: git pull origin main
Na pasta backend: php spark migrate
Para conferir as rotas: php spark routes
Execute o backend na porta 8080 e o frontend com npm.cmd run dev na pasta frontend.
Abra http://localhost:5173 e clique em Planos.

TESTES MANUAIS
1. Cadastre um plano antigo como inativo, sem inventar data de vigência.
2. Cadastre um plano atual como ativo.
3. Crie nova versão/reajuste no plano antigo com novo código, valor e duração.
4. Confira que o histórico não foi apagado e que somente uma versão daquela família fica ativa.
5. Tente repetir um código já cadastrado: deve haver erro de duplicidade.
6. Confirme que usuários comuns não podem acessar a API /api/planos.

OBSERVAÇÃO: as vendas e os cálculos de comissão ainda não estão ligados ao cadastro de planos. O código foi enviado ao GitHub, mas a migration e os testes em XAMPP devem ser executados no seu computador.

AJUSTES DE 09/10/2026 — SIGLAS E EDIÇÃO

1. Planos são identificados por sigla (P/T, R/T): os quatro algarismos são individuais de cada título vendido, não pertencem ao cadastro do plano.
2. A coluna existente plano_versoes.codigo foi preservada, contendo a SIGLA. O plano P/T já cadastrado continua no banco, sem reset.
3. Uma mesma sigla pode existir em versões diferentes (inclusive com reajustes de preço). Foi removida a restrição UNIQUE global de codigo por uma nova migration.
4. A ação Editar corrige sigla/valor/duração/vigência de uma versão ainda não utilizada por vendas, registrando o antes/depois em plano_alteracoes. Quando houver venda vinculada, editar condições é bloqueado; use Reajustar.
5. Reajustar copia sigla, valor, duração e situação da versão atual. A data de vigência fica em branco para não presumir uma data não informada.
6. Excluir remove o plano e suas versões somente se não houver vendas referenciando as versões; solicita confirmação personalizada, registra auditoria e retorna erro em caso de restrição referencial.
7. O frontend utiliza os componentes compartilhados de frontend/src/components/UiFields.jsx: FormControl type select/date/time/datetime (popover próprio, z-index adequado, responsivo).
8. Corrigidos os rótulos de formulário que quebravam o asterisco obrigatório para a linha de baixo e o layout dos botões em telas pequenas.

ATUALIZAÇÃO LOCAL

    cd D:\Ahritech\Sistemas\Web\splash
    git pull origin main
    cd backend
    php spark migrate

Depois reinicie o Vite no frontend e valide:

- O P/T anteriormente cadastrado continua listado.
- Ao clicar em Editar, sigla P/T, valor e prazo aparecem preenchidos.
- Ao clicar em Reajustar, os mesmos valores são copiados; você altera apenas os dados modificados.
- Em Excluir, aparece confirmação; não é possível excluir plano vinculado a vendas.
- Selects não usam menu nativo; datas utilizam calendário SPLASH.
- Tente criar uma segunda versão com sigla repetida e valor atualizado (deve funcionar após a migration).

IMPORTANTE: não apague o banco nem execute migrate:refresh. Somente php spark migrate.
O fluxo de geração de número individual (quatro dígitos) será implementado no cadastro de Vendas, que ainda não existe.
