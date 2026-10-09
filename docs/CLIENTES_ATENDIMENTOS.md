# SPLASH — Clientes, corrente e atendimentos

## Módulos publicados

1. **Clientes**: cadastros completos com nome, telefone, CPF opcional, e-mail, nascimento, endereço, profissão, observações, origem, cliente indicador e dono da corrente.
2. **Atendimentos**: chegada de cliente existente ou novo cadastro rápido, início do atendimento, atendente principal e segundo participante opcional, encerramento e duração.
3. **Origens e motivos**: cadastros livres, edição e inativação sem exclusão de registros usados no histórico.

## Corrente

- O dono da corrente é uma pessoa cadastrada em Pessoas com papel Corretor ou Vendedor.
- Indicação de um cliente existente: a corrente nova **herda automaticamente** o dono da corrente do cliente indicador, mesmo que outra pessoa tenha convidado ou atendido.
- Mudança manual do dono exige justificativa de pelo menos cinco caracteres; toda mudança fica registrada em `cliente_corrente_historico`, disponível no botão **Corrente**.
- O vínculo da indicação e o histórico são independentes do vendedor/atendente da visita.
- Um cliente pode ser visitado mais de uma vez; em retornos a regra atual mantém o primeiro atendente principal.

## Visitas e tempo

- Chegada: recebe hora do servidor, cria a visita em AGUARDANDO e histórico.
- Iniciar: define atendente(s), recebe hora do servidor e muda para ATENDENDO.
- Encerrar: recebe hora do servidor, registra duração, observações e um de três resultados:
  - RETORNO: data prevista de retorno obrigatória;
  - SEM_VENDA: motivo de não venda obrigatório;
  - PENDENCIA: negociação pendente, **sem registrar valor financeiro nesta etapa**.
- Não é possível abrir simultaneamente duas visitas ativas para o mesmo cliente.
- Mostra total, aguardando, em atendimento, finalizados, tempo médio, menor e maior duração por período. Não chama de "venda" aquilo que ainda não foi vinculado a uma venda real.
- Datas/horas são registradas pelo servidor segundo `backend/app/Config/App.php`, timezone America/Sao_Paulo.
- Acesso ao cadastro e APIs de clientes/visitas/origens restrito ao administrador. Não basta esconder menus.

## Estrutura do banco

Migration `2026-10-10-000001_CreateClientesVisitas.php`:
- `lead_origens` (padrões editáveis: Lead de anúncio, Indicação, Renovação, Outro);
- `motivos_nao_venda` (padrões editáveis);
- `clientes` (CPF opcional único, dono da corrente, indicador e contatos);
- `cliente_corrente_historico` (dono antes/depois, origem da mudança, justificativa, usuário);
- `visitas` (atendentes, status, chegada, início, fim, previsão retorno, motivo, observações);
- `visita_status_historico` (todas as mudanças de status).

As tabelas preservam vínculos com Pessoas e usuários Shield existentes; não apagam planos nem usuários.

## Atualização local Windows PowerShell

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

Backend de desenvolvimento deve estar em `http://127.0.0.1:8080` e React em `http://localhost:5173`.

**Nunca execute `migrate:refresh` ou apague as tabelas existentes.** O comando `php spark migrate` executa apenas as migrations pendentes.

## Testes manuais

1. Entrar como admin e confirmar os menus Clientes, Atendimentos e Origens e motivos.
2. Ter pelo menos uma pessoa com papel Corretor ou Vendedor em Pessoas.
3. Cadastrar cliente A com origem Lead de anúncio e dono de corrente definido.
4. Cadastrar cliente B, escolher A como indicador e verificar que o dono da corrente do cliente B foi herdado de A.
5. Editar cliente A, trocar dono da corrente com justificativa e conferir o histórico no botão Corrente (o cliente B mantém seu histórico próprio; não há reassociação silenciosa).
6. Registrar chegada de cliente B; conferir AGUARDANDO e hora de chegada.
7. Iniciar atendimento com vendedor ou corretor; conferir ATENDENDO e hora de início.
8. Encerrar como Não fechou (informe motivo) ou Retorno (informe data); conferir duração automática.
9. Registrar nova visita de B e verificar o mesmo atendente do primeiro atendimento.
10. Entrar como vendedor e tentar `GET /api/clientes` ou `GET /api/atendimentos`: deve retornar 403, sem informações pessoais.

## Escopo ainda não implementado

- Venda efetiva vinculada ao atendimento, conversão comercial e aproveitamento (medido por vendas reais).
- Entrada de dinheiro em pendência, comissão antecipada, devolução, fechamento e liquidações.
- Vencimentos, renovações, upgrades e vínculo de títulos.
- Importação de fotos/CSV e relatório PDF.

A etapa atual registra operações comerciais e dados sem inventar comissão financeira. Vinculação com venda e cálculo do aproveitamento entram no módulo seguinte.

**Validação:** os arquivos estão no GitHub, mas a migration e execução devem ser conferidas no XAMPP do usuário; a compilação React pode ser verificada com `npm.cmd run build`.
