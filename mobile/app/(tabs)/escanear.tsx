import AgendamentosScreen from './agendamentos';

// Acesso rápido central: abre diretamente a câmera de chegada.
// O check-in apenas registra presença; iniciar atendimento é outra ação.
export default function EscanearScreen() {
  return <AgendamentosScreen initialMode="scan" />;
}
