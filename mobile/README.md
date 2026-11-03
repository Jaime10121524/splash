# Splash Next — React Native (Expo)

Primeira entrega independente do frontend web e do aplicativo Capacitor. O aplicativo lê dados reais da API mobile do CodeIgniter 4, sem mockups, e não altera telas do desktop.

## Entregue nesta etapa

- Login nativo com usuário e senha do Shield; API emite token com escopo **mobile** e expiração de 30 dias.
- Token persistido via **Expo SecureStore**, jamais em AsyncStorage; logout revoga o token no servidor.
- Interface mobile criada em React Native: login, início, lista de atendimentos e perfil.
- Atendimentos consultados com as mesmas regras de visibilidade do corretor ou da gestão.
- Abas inferiores, gestos de atualização, busca rápida, filtros de status, carregamento e estados vazios.
- Etapa 2: detalhes de visitas, linha do tempo, registro de chegada para clientes existentes ou **cadastro rápido integrado**, início, resultado e retomada quando permitida. Telefones usam máscara brasileira visual e vão à API só com dígitos.
- Registros passam pela API com token, validação de perfil, escopo do corretor, bloqueios de status e histórico auditável.
- A marca utiliza exatamente as cores do web: roxo #7861F9, escuro #624CDE e claro #EFEAFF.
- O encerramento como VENDA registra somente o resultado comercial; títulos, parcelas e comissões continuam exclusivos do módulo de Vendas.

## Pré-requisitos

- Node.js 22.13+ (Expo SDK 58), Android Studio/emulador ou celular Android.
- Backend CodeIgniter atualizado com as rotas "/api/mobile/*" desta branch.
- Para desenvolvimento em PC e celular na mesma rede Wi-Fi, é permitido HTTP com IP privado somente na build de desenvolvimento. Não utilize senhas reais em uma rede sem criptografia; para uso real, configure HTTPS.
- A configuração local vai em "mobile/.env.local", não comitar.

## Configurar no PowerShell

    cd D:\Ahritech\Sistemas\Web\splash
    git fetch origin
    git checkout feature/react-native-splash-mobile
    cd mobile
    npm install
    npx expo install --fix
    Copy-Item .env.example .env.local
    notepad .env.local
    npm run typecheck
    npx expo start

Editar EXPO_PUBLIC_SPLASH_API_URL com a origem do backend, SEM "/api" e sem barra final.

### Teste no mesmo computador e celular (rede Wi-Fi privada)

1. No PowerShell, execute `ipconfig` e anote o IPv4 da placa Wi-Fi, por exemplo `192.168.1.105`.
2. Em outro terminal inicie o backend:
   ```powershell
   cd D:\Ahritech\Sistemas\Web\splash\backend
   php spark serve --host 0.0.0.0 --port 8080
   ```
3. No navegador do celular (mesma Wi-Fi) abra `http://192.168.1.105:8080/api/mobile/me` (substitua pelo IP real). A resposta de acesso negado/401 em JSON confirma que a rota é alcançável; erro de conexão indica rede/firewall/servidor.
4. No `mobile/.env.local` use:
   ```env
   EXPO_PUBLIC_SPLASH_API_URL=http://192.168.1.105:8080
   ```
5. No diretório `mobile`, execute `npx.cmd expo start --lan --clear` e abra no Expo Go. Não use `localhost` no celular: é o próprio celular, não o PC.

Para emulador Android, usar `http://10.0.2.2:8080`. Para um backend HTTPS de teste ou produção, usar `https://seu-dominio.com`.

O HTTP local é permitido no app somente em modo de desenvolvimento. Use uma rede confiável e credenciais descartáveis; em produção e para dados reais, HTTPS é obrigatório. Se a rede ou o Android bloquearem HTTP, exponha o backend por uma origem HTTPS de desenvolvimento ao invés de desabilitar proteções.

Android: pressionar "a" com emulador configurado ou usar uma build de desenvolvimento. Em produção, gerar APK/AAB próprio do Expo, sem substituir o app Capacitor existente antes de homologar.

## Segurança / notas de integração

- "POST /api/mobile/login": credenciais JSON, verificação pelo Shield, limite de tentativas e emissão de token com expiração.
- "GET /api/mobile/me": token Shield Bearer, escopo mobile.
- "POST /api/mobile/logout": revoga o token apresentado.
- "GET /api/mobile/atendimentos?periodo=hoje|todos": consulta escopada à pessoa vinculada ao corretor. Máximo de 100 itens exibidos; servidor retorna contadores reais.
- "GET /api/mobile/atendimentos/{id}": detalhes, status e histórico de uma visita escopada.
- "GET /api/mobile/atendimento-opcoes": atendentes e corretores ativos e motivos de não fechamento.
- "GET /api/mobile/clientes?q={consulta}": localiza até 25 clientes ativos, respeitando a corrente do corretor.
- "POST /api/mobile/atendimentos/chegada": aceita `cliente_id` **ou** `novo_cliente` (`nome`, `telefone`, `origem_id`, `dono_corrente_pessoa_id`, CPF/e-mail opcionais, indicação opcional). O cliente é validado com `ClienteRules`, e cliente + corrente + visita são salvos na mesma transação. Preserva o escopo de corretor e bloqueia duplicidade de visitas ativas.
- "POST /api/mobile/atendimentos/{id}/iniciar": inicia sessão e histórico, exigindo atendente válido.
- "POST /api/mobile/atendimentos/{id}/finalizar": valida resultado, motivo/retorno, grava histórico e encerra sessão.
- "GET /api/mobile/cliente-visita-retomavel?cliente_id={id}": verifica, dentro das permissões do usuário, se já existe visita finalizada hoje, antes de registrar chegada.
- "POST /api/mobile/atendimentos/{id}/retomar": recebe `modo_atendente=mesmo` e confirma o **mesmo atendente** já gravado na visita. Retoma a MESMA visita e inicia uma nova sessão em uma transação, sem receber nem permitir outro atendente; preserva tempos anteriores e histórico de status. Pode receber corretores da tela de chegada sem alterar a corrente do cliente.
- Na chegada de cliente existente, se houver visita encerrada hoje, o app pergunta apenas **Retomar com o mesmo atendente?**, exibindo o nome anterior. Cancelar não altera o atendimento.
- Não existe opção de trocar atendente na retomada do aplicativo. A API rejeita solicitações de troca, mesmo que venham de versões antigas ou requisições manuais.
- Confirmação e sucesso das operações de atendimento usam modal visual Splash em vez de `Alert.alert` Android.
- Nenhum endpoint financeiro foi liberado ao token mobile.
- O token não deve ser usado na API de sessão web. Nenhuma rota móvel é liberada sem o filtro Shield "tokens:mobile".
- O frontend trata 403 como falta de permissão, não como uma lista de dados inventados.
- O app não grava sem rede. Ações de visitas são verificadas no backend com token Shield; a retomada do mesmo atendente registra uma nova sessão e eventos de status.

## Homologação obrigatória antes de merge

1. Conferir "php spark routes" e os filtros "tokens:mobile", inclusive tentativa sem token, token inválido e token revogado.
2. Este ajuste de retomada **não exige uma nova migração**. A tabela opcional `visita_atendente_trocas`, criada por uma versão anterior do protótipo, é lida apenas se já existir. Não rode migrações desnecessárias só para testar a retomada.
3. Verificar login, sessão restaurada após reinício, logout e expiração do token no Android real.
4. Conferir as permissões usando administrador, corretor com pessoa vinculada, corretor sem vínculo e vendedor.
5. Verificar isolamento de visitas entre corretores, telefones e dados de cliente.
6. Testar no servidor HTTPS (incluindo HostGator), no modo escuro do aparelho e com teclado aberto.
7. Validar TypeScript e testar compilação Android. Não considerar este PR um APK pronto.

Próximas entregas: cadastro completo/edição de clientes pelo app, vendas, notificações nativas, financeiro e fluxos por perfil. O cadastro rápido na chegada coleta somente os campos necessários e alguns opcionais.
