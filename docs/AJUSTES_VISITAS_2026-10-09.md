# SPLASH — Ajustes em clientes, corretores e atendimentos

Revisão da interface em 09/10/2026. Arquivos enviados à branch main do GitHub. Aplicar as migrations **sem recriar tabelas**.

## Alterações implementadas

1. **Telefone**: componente `PhoneInput.jsx` reutilizável em Clientes e Pessoas, com DDD, máscara (DD) 99999-9999 ou (DD) 9999-9999 e no máximo 11 dígitos. Banco armazena somente os números. A API de Clientes/Pessoas exige 10 ou 11 dígitos. FormControl `type="tel"` também usa o componente.
2. **Asterisco obrigatório**: legenda e símbolo agora formam uma única linha visual nos formulários; estilo global no `App.css`.
3. **Cliente indicador**: o campo `Quem indicou?` aparece **somente** quando a origem estiver marcada como `Origem de indicação`. O catálogo é configurável (checkbox em Origens e motivos), e as origens existentes continuam cadastradas. A origem padrão Indicação será marcada na migration.
4. **Venda fechada**: resultado comercial `VENDA` no encerramento do atendimento, preservado no banco/histórico. **Ainda NÃO** emite número de título, lançamento financeiro ou comissão, pendências da etapa de Vendas. A interface informa isso.
5. **Corretor x corrente**: corretor principal e segundo corretor opcionais *entre si*? Não: o principal é obrigatório nas novas visitas, o segundo é opcional. São independentes do dono da corrente e de quem fez o registro. Ex.: dona da corrente James e corretora Marta; esposa com login de Operador pode lançar a visita, sem ser corretora do cliente.
6. **Retorno no mesmo dia**: `Retomar hoje` reabre visita SEM_VENDA/RETORNO/PENDENCIA do mesmo dia, mantendo **o mesmo ID** e histórico de resultados. Não cria visita nova. Se o usuário registrar nova chegada desse cliente no mesmo dia, a API também recupera a última visita concluída em vez de duplicá-la. O tempo é soma dos períodos de atendimento guardados em `visita_sessoes`, sem contar o intervalo fora do clube. Em dia posterior, cria nova visita.
7. **Correção de históricos**: visitas antigas têm corretor inicialmente não informado; botão `Corretores` permite ajustar, com auditoria de alterações. Não atribuimos automaticamente o dono da corrente como corretor.
8. **Perfil Operador**: pessoa com papel Operador e usuário com grupo Operador pode registrar clientes e atendimentos para quaisquer corretores do clube. A API permite o acesso operacional a esses cadastros, mas **não concede financeiro, usuários, planos nem fechamentos**. Somente admin cria e gerencia acessos.
9. **Clientes → Registrar chegada**: abre o fluxo de Atendimentos com o cliente previamente selecionado e solicita corretor antes de gravar.
10. **Migrations não destrutivas**: `2026-10-10-000002_RevisarVisitasCorretoresSessoes.php` cria corretores, histórico e sessões; converte horários/resultados de atendimentos antigos. `2026-10-10-000003_OrigemIndicacao.php` adiciona atributo ao cadastro de origens.

## Aplicar no Windows

```powershell
cd D:\Ahritech\Sistemas\Web\splash
git pull origin main
cd backend
php spark migrate
php spark routes
cd ..\frontend
npm.cmd run build
npm.cmd run dev
```

Mantenha o backend na porta 8080. **NÃO use `migrate:refresh` nem limpe o banco**.

## Testes recomendados

- Corrigir telefone de cliente que tinha mais de 11 dígitos, salvar e consultar novamente.
- Verificar que `Quem indicou?` só aparece para origem Indicação, e que a origem customizada pode habilitar essa opção.
- Registrar cliente com dona da corrente pessoa A, corretor principal pessoa B e segundo corretor C. Visualizar os 3 independentes.
- Criar uma conta Operador e confirmar que possui Clientes e Atendimentos e não acessa APIs de financeiro/usuários.
- Iniciar visita, encerrar como Não fechou e informar motivo; voltar na mesma data e clicar Retomar hoje. Deve manter o mesmo registro, reiniciar o tempo da nova sessão e preservar o primeiro motivo.
- Encerrar como Venda fechada. Deve alterar apenas o resultado comercial, **sem gerar comissão fictícia**.
- Testar retorno em outro dia: cria nova visita e mantém atendente anterior.

## Limitações

Falta concluir o módulo de Vendas, com documento do título (número de 4 dígitos individual), comissão, divisão entre participantes, pagamentos e fechamento. O resultado VENDA é um sinal de venda realizada, mas não um registro financeiro.
A compilação e a execução local ainda precisam ser confirmadas: as alterações estão no GitHub, não no XAMPP remotamente.
