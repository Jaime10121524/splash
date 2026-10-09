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
