# Splash Next — React Native (Expo)

Primeira entrega independente do frontend web e do aplicativo Capacitor. O aplicativo lê dados reais da API mobile do CodeIgniter 4, sem mockups, e não altera telas do desktop.

## Entregue nesta etapa

- Login nativo com usuário e senha do Shield; API emite token com escopo **mobile** e expiração de 30 dias.
- Token persistido via **Expo SecureStore**, jamais em AsyncStorage; logout revoga o token no servidor.
- Interface mobile criada em React Native: login, início, lista de atendimentos e perfil.
- Atendimentos consultados com as mesmas regras de visibilidade do corretor ou da gestão.
- Abas inferiores, gestos de atualização, busca rápida, filtros de status, carregamento e estados vazios.
- Nenhuma venda, cliente, visita ou comissão é modificada nesta entrega (consulta somente).

## Pré-requisitos

- Node.js 22.13+ (Expo SDK 58), Android Studio/emulador ou celular Android.
- Backend CodeIgniter atualizado com as rotas "/api/mobile/*" desta branch.
- HTTPS acessível no celular; nunca publicar um backend HTTP com credenciais reais.
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

Editar EXPO_PUBLIC_SPLASH_API_URL com a origem HTTPS do backend, SEM "/api" e sem barra final, por exemplo "https://seu-dominio.com". Para simular Android local, use apenas desenvolvimento com endereço acessível do emulador e política de rede apropriada.

Android: pressionar "a" com emulador configurado ou usar uma build de desenvolvimento. Em produção, gerar APK/AAB próprio do Expo, sem substituir o app Capacitor existente antes de homologar.

## Segurança / notas de integração

- "POST /api/mobile/login": credenciais JSON, verificação pelo Shield, limite de tentativas e emissão de token com expiração.
- "GET /api/mobile/me": token Shield Bearer, escopo mobile.
- "POST /api/mobile/logout": revoga o token apresentado.
- "GET /api/mobile/atendimentos?periodo=hoje|todos": consulta escopada à pessoa vinculada ao corretor. Máximo de 100 itens exibidos; servidor retorna contadores reais.
- O token não deve ser usado na API de sessão web. Nenhuma rota móvel é liberada sem o filtro Shield "tokens:mobile".
- O frontend trata 403 como falta de permissão, não como uma lista de dados inventados.
- O app não tem funções offline de escrita nem permite operar uma visita nesta primeira entrega; essas ações exigem a mesma validação do backend da versão web.

## Homologação obrigatória antes de merge

1. Conferir "php spark routes" e os filtros "tokens:mobile", inclusive tentativa sem token, token inválido e token revogado.
2. Executar "php spark migrate" somente se houver migrations pendentes. Esta entrega não cria migrations.
3. Verificar login, sessão restaurada após reinício, logout e expiração do token no Android real.
4. Conferir as permissões usando administrador, corretor com pessoa vinculada, corretor sem vínculo e vendedor.
5. Verificar isolamento de visitas entre corretores, telefones e dados de cliente.
6. Testar no servidor HTTPS (incluindo HostGator), no modo escuro do aparelho e com teclado aberto.
7. Validar TypeScript e testar compilação Android. Não considerar este PR um APK pronto.

Próximas entregas: detalhamento de visita e ações autenticadas (chegada/início/finalização), clientes, vendas, notificações nativas, financeiro e fluxos por perfil.
