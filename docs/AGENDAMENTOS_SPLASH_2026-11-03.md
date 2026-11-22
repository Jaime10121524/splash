# Splash Next · Agendamentos com QR e carteira de clientes

## Recursos na branch de desenvolvimento

- **Agendamento**: número automático, nome completo, telefone com DDD, data, quantidade de pessoas, corretor captador e observações. Sem criar venda antecipada.
- **Convite em PNG**: cartão roxo com QR Code local, sem serviço externo; imagem compartilhável no app ou baixada no navegador. O QR contém uma chave aleatória de 32 bytes, não os dados pessoais.
- **Recepção**: ler QR no app com a câmera (ou pelo leitor do PC), consultar dados, confirmar corretor principal, opcional segundo corretor e atendente. Os dados são validados novamente no servidor com sessão/CSRF ou token Shield.
- **Check-in atômico**: aproveita cliente existente inequivocamente igual ou solicita vínculo manual, registra visita em atendimento, sessão e histórico, atualiza comparecimento. Um QR cancelado ou usado não entra novamente.
- **Funil**: agendamentos ativos, comparecimentos, faltas após data, fechamentos vinculados à visita e suas taxas, usando todos os agendamentos do filtro.
- **Clientes no app**: lista, busca, WhatsApp, criação/edição. Depois do registro de resultado "VENDA", sugere completar CPF, e-mail e nascimento se faltarem. **Não cria título nem comissão**: continuam no módulo Vendas.
- **Indicações**: seletor de clientes, registro opcional de bonificação. Só admin pode confirmar que está paga, o que cria uma despesa real na conta do titular da corrente. Pendente não gera despesa; registro único por indicado.
- **Avisos de informação**: toast com barra de progresso degradê e fechamento automático. Ações que exigem decisão continuam usando modal de confirmação.

## Privilégios e auditoria

O token mobile é exigido em todas as operações do app. Perfis de corretor acessam apenas seus agendamentos e clientes da corrente, e precisam participar do atendimento. A captura original não é sobrescrita pela equipe da recepção; comparações por captador/participante permanecem possíveis. A leitura de QR por si só não abre nenhuma visita sem confirmação autenticada.

## Migração (OBRIGATÓRIA ANTES DO TESTE REAL)

Crie backup do banco MySQL/MariaDB utilizado no backend; **não execute a migração sem backup**. A branch adiciona:

- `2026-11-03-000002_CreateAgendamentosSplash.php` — tabela `agendamentos` e origem padrão;
- `2026-11-03-000003_BonificacoesIndicacao.php` — `indicacao_bonificacoes`, única por cliente indicado.

A ferramenta `php spark migrate` também pode executar outras migrações pendentes da branch, inclusive `2026-11-03-000001_AuditarTrocaAtendenteRetomadaMobile.php`. Antes disso, consulte `php spark migrate:status` e confira a conexão do banco em `backend/.env`. Não use SQL de alteração manual isolado nem aplique em produção sem homologação.

### Atualização local Windows

Com o Expo e PHP interrompidos:

```powershell
Set-Location 'D:\Ahritech\Sistemas\Web\splash'
git switch feature/react-native-splash-mobile
git pull --ff-only origin feature/react-native-splash-mobile

Set-Location .\frontend
npm.cmd install
npm.cmd run build

Set-Location ..\mobile
npm.cmd install
npm.cmd run typecheck
npm.cmd run test:phone

Set-Location ..\backend
php spark migrate:status
# Após backup e conferência: php spark migrate
```

Em terminais separados após migrar:

```powershell
Set-Location 'D:\Ahritech\Sistemas\Web\splash\backend'
php spark serve --host 0.0.0.0 --port 8080
```

```powershell
Set-Location 'D:\Ahritech\Sistemas\Web\splash\mobile'
if (Test-Path '.expo') { Remove-Item '.expo' -Recurse -Force }
npx.cmd expo start --lan --clear
```

A URL de API de desenvolvimento em `mobile/.env.local` deve apontar ao IP atual da máquina na porta 8080; o arquivo local não deve ser sobrescrito.

## Cenários de homologação

1. Criar agendamento no PC, baixar convite PNG, abrir no celular e ler QR.
2. Criar agendamento no app, compartilhar a imagem PNG por WhatsApp, conferir legibilidade no outro celular.
3. Receber com mesmo corretor; depois com dois corretores e outro atendente autorizado.
4. Tentar reutilizar o QR e confirmar bloqueio, sem segunda visita.
5. Tentar ler QR de outro corretor e confirmar autorização negada.
6. Cadastrar e vincular um cliente com telefone semelhante; evitar duplicação e impedir vínculo com pessoa errada.
7. Registrar bonificação pendente e conferir que não afetou o financeiro; administrador paga, gera **uma** despesa; segunda confirmação deve ser negada.
8. Finalizar a visita como VENDA e conferir atualização dos indicadores; revisar convite, dados complementares e telas de clientes.
9. Confirmar que fechamento real e comissão exigem procedimento no módulo Vendas.
10. Verificar comportamento de câmera, permissões, compartilhamento PNG, teclado e mensagens temporárias em Android real.

Não publicar esta branch em produção até as verificações com banco real e os fluxos de usuário estarem aprovados.
