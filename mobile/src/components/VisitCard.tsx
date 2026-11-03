import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Visit, displayDate, displayTime } from '../api';
import { colors, shadows } from '../theme';

const labels: Record<string, string> = {
  AGUARDANDO: 'Aguardando',
  ATENDENDO: 'Em atendimento',
  RETORNO: 'Retorno',
  SEM_VENDA: 'Não fechou',
  PENDENCIA: 'Em negociação',
  VENDA: 'Venda fechada',
  CANCELADA: 'Cancelada',
};

const stateColors: Record<string, { background: string; text: string }> = {
  AGUARDANDO: { background: '#FFF4DC', text: '#9E6A11' },
  ATENDENDO: { background: '#E2F2FF', text: '#1D73A7' },
  RETORNO: { background: '#EEEAFE', text: '#6B55B7' },
  VENDA: { background: '#E4F7EC', text: '#287F4B' },
  PENDENCIA: { background: '#FFF2E6', text: '#A55B1D' },
  SEM_VENDA: { background: '#F0F2F5', text: '#66758B' },
  CANCELADA: { background: '#FDE9ED', text: '#B14155' },
};

export default function VisitCard({ visit, compact = false }: { visit: Visit; compact?: boolean }) {
  const state = stateColors[visit.status] ?? { background: '#EFF2F6', text: colors.muted };
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(visit.cliente_nome || '?').trim().slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>{visit.cliente_nome}</Text>
          <Text style={styles.sub}>Visita #{visit.id} · {displayDate(visit.chegada_em)}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <View style={[styles.pill, { backgroundColor: state.background }]}>
          <Text style={[styles.pillText, { color: state.text }]}>{labels[visit.status] ?? visit.status}</Text>
        </View>
        <View style={styles.hour}>
          <SymbolView name={{ ios: 'clock', android: 'schedule' }} size={15} tintColor={colors.muted} />
          <Text style={styles.sub}>{displayTime(visit.chegada_em)}</Text>
        </View>
      </View>
      {!compact && visit.atendente_nome ? <Text style={styles.agent} numberOfLines={1}>Atendente: {visit.atendente_nome}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: 17, borderRadius: 21, marginBottom: 12, ...shadows.card },
  compact: { marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
  avatarText: { color: colors.brandDark, fontSize: 17, fontWeight: '800' },
  identity: { flex: 1 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  pill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 50 },
  pillText: { fontWeight: '700', fontSize: 11 },
  hour: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  agent: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 13, paddingTop: 12, color: colors.muted, fontSize: 12 },
});
