import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { ApiError, VisitData, Visit, apiRequest } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import VisitCard from '../../src/components/VisitCard';
import { colors } from '../../src/theme';

const filters = [
  { label: 'Todas', value: '' },
  { label: 'Aguardando', value: 'AGUARDANDO' },
  { label: 'Atendendo', value: 'ATENDENDO' },
  { label: 'Retorno', value: 'RETORNO' },
  { label: 'Negociação', value: 'PENDENCIA' },
  { label: 'Venda', value: 'VENDA' },
  { label: 'Não fechou', value: 'SEM_VENDA' },
];

export default function AtendimentosScreen() {
  const { token } = useAuth();
  const [periodo, setPeriodo] = useState<'hoje' | 'todos'>('hoje');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [visitas, setVisitas] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<VisitData>('mobile/atendimentos?periodo=' + periodo, { token });
      setVisitas(data.visitas);
      setError(''); setForbidden(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else setError(e instanceof Error ? e.message : 'Erro ao carregar atendimentos.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, periodo]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const results = useMemo(() => visitas.filter(v =>
    (!status || v.status === status) &&
    (!query.trim() || v.cliente_nome.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')) ||
      String(v.id).includes(query.trim()))
  ), [visitas, status, query]);

  async function refresh() { setRefreshing(true); await load(); }
  function chooseStatus(value: string) { setStatus(value); Haptics.selectionAsync().catch(() => {}); }

  return <SafeAreaView style={styles.root} edges={['top']}>
    <FlatList
      data={results}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      renderItem={({ item }) => <VisitCard visit={item} />}
      ListHeaderComponent={<View>
        <Text style={styles.eyebrow}>ROTINA COMERCIAL</Text>
        <Text style={styles.title}>Atendimentos</Text>
        <Text style={styles.subtitle}>Acompanhe as visitas sem complicação.</Text>
        <View style={styles.searchRow}>
          <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={colors.muted} />
          <TextInput
            value={query} onChangeText={setQuery} placeholder="Buscar por cliente ou visita"
            placeholderTextColor="#9BA8B8" style={styles.search} autoCorrect={false}
            accessibilityLabel="Buscar atendimentos"
          />
          {query ? <Pressable onPress={() => setQuery('')} accessibilityLabel="Limpar busca"><SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel' }} size={18} tintColor={colors.muted} /></Pressable> : null}
        </View>
        <View style={styles.periods}>
          {(['hoje', 'todos'] as const).map(value => <Pressable key={value} onPress={() => setPeriodo(value)}
            style={[styles.period, periodo === value && styles.periodActive]}>
            <Text style={[styles.periodText, periodo === value && styles.periodTextActive]}>{value === 'hoje' ? 'Hoje' : 'Todas as visitas'}</Text>
          </Pressable>)}
        </View>
        <FlatList
          horizontal data={filters} keyExtractor={item => item.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
          renderItem={({ item }) => <Pressable onPress={() => chooseStatus(item.value)}
            style={[styles.chip, status === item.value && styles.chipActive]}>
            <Text style={[styles.chipText, status === item.value && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>}
        />
        <View style={styles.resultRow}>
          <Text style={styles.sectionTitle}>Visitas</Text>
          {!loading && !forbidden && !error ? <Text style={styles.count}>{results.length} exibidas</Text> : null}
        </View>
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 35 }} size="large" color={colors.brand} /> :
        <View style={styles.empty}>
          <SymbolView name={{ ios: 'calendar.badge.clock', android: 'event' }} size={34} tintColor={colors.muted} />
          <Text style={styles.emptyTitle}>{forbidden ? 'Acesso restrito' : error ? 'Não foi possível carregar' : 'Nada por aqui ainda'}</Text>
          <Text style={styles.emptyText}>{forbidden ? 'Seu perfil não possui permissão para consultar atendimentos.' :
            error || 'Tente outro período ou filtro para encontrar uma visita.'}</Text>
          {error ? <Pressable onPress={load}><Text style={styles.retry}>Tentar novamente</Text></Pressable> : null}
        </View>}
      keyboardShouldPersistTaps="handled"
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 21, paddingBottom: 35, flexGrow: 1 },
  eyebrow: { color: colors.brandDark, fontSize: 10, letterSpacing: 1.3, fontWeight: '900' },
  title: { color: colors.ink, fontSize: 28, marginTop: 7, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, marginTop: 7, fontSize: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderColor: colors.line, backgroundColor: '#FFFFFF', borderWidth: 1, marginTop: 24, paddingHorizontal: 15, height: 53 },
  search: { flex: 1, color: colors.ink, fontSize: 13, height: '100%' },
  periods: { backgroundColor: '#E9EDF4', padding: 4, flexDirection: 'row', borderRadius: 14, marginTop: 15, marginBottom: 14 },
  period: { flex: 1, borderRadius: 11, height: 37, alignItems: 'center', justifyContent: 'center' },
  periodActive: { backgroundColor: '#FFFFFF' },
  periodText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  periodTextActive: { color: colors.ink },
  chip: { paddingHorizontal: 15, paddingVertical: 9, backgroundColor: '#FFFFFF', borderColor: colors.line, borderWidth: 1, borderRadius: 50 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 13 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  count: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  empty: { padding: 25, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', marginTop: 10 },
  emptyTitle: { fontSize: 17, color: colors.ink, fontWeight: '800', marginTop: 12 },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 9, lineHeight: 20 },
  retry: { marginTop: 15, fontSize: 13, color: colors.brandDark, fontWeight: '800' },
});
