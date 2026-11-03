import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { apiRequest, MobileClient, MobileVisitOptions } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import ChoiceSheet from '../../src/components/ChoiceSheet';
import { colors } from '../../src/theme';

type BrokerField = 'main' | 'second' | null;

export default function NewVisitScreen() {
  const { token } = useAuth();
  const [options, setOptions] = useState<MobileVisitOptions | null>(null);
  const [selected, setSelected] = useState<MobileClient | null>(null);
  const [clients, setClients] = useState<MobileClient[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [main, setMain] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [sheet, setSheet] = useState<BrokerField>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    apiRequest<MobileVisitOptions>('mobile/atendimento-opcoes', { token })
      .then(value => {
        if (!mounted) return;
        setOptions(value);
        setMain(value.minha_pessoa_id);
      })
      .catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'Não foi possível carregar os corretores.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    if (!token || query.trim().length < 2 || selected) {
      setClients([]); setSearching(false); return;
    }
    let active = true;
    setSearching(true);
    const job = setTimeout(() => {
      apiRequest<{ clientes: MobileClient[] }>('mobile/clientes?q=' + encodeURIComponent(query.trim()), { token })
        .then(result => { if (active) { setClients(result.clientes); setError(''); } })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Erro ao buscar cliente.'); })
        .finally(() => { if (active) setSearching(false); });
    }, 350);
    return () => { active = false; clearTimeout(job); };
  }, [token, query, selected]);

  async function register() {
    if (saving || !selected || !main || !token) {
      setError('Escolha um cliente e o corretor responsável.');
      return;
    }
    if (second === main) {
      setError('O segundo corretor deve ser diferente do primeiro.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<{ message: string; visita_id: number; retomada?: boolean }>(
        'mobile/atendimentos/chegada', {
          method: 'POST',
          token,
          body: { cliente_id: selected.id, corretor_pessoa_id: main, segundo_corretor_pessoa_id: second },
        },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(result.retomada ? 'Visita retomada' : 'Chegada registrada', result.message, [
        { text: 'Abrir atendimento', onPress: () => router.replace({
          pathname: '/atendimento/[id]', params: { id: String(result.visita_id) },
        }) },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a chegada.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  const brokers = (options?.corretores ?? []).map(p => ({ id: p.id, label: p.nome }));
  const mainName = options?.corretores.find(p => p.id === main)?.nome;
  const secondName = options?.corretores.find(p => p.id === second)?.nome;

  return <SafeAreaView style={styles.root} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
            <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back' }} size={20} tintColor={colors.ink} />
          </Pressable>
          <View>
            <Text style={styles.eyebrow}>OPERAÇÃO / VISITAS</Text>
            <Text style={styles.heading}>Registrar chegada</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.orbit} />
          <View style={styles.heroIcon}>
            <SymbolView name={{ ios: 'person.crop.circle.badge.plus', android: 'person_add' }} size={25} tintColor="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Tudo começa{'\n'}com uma chegada.</Text>
          <Text style={styles.heroSub}>Escolha um cliente cadastrado e o corretor da visita.</Text>
        </View>

        {!!error && <View style={styles.feedback}>
          <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error_outline' }} size={19} tintColor="#A75D39" />
          <Text style={styles.feedbackText}>{error}</Text>
          <Pressable onPress={() => setError('')} accessibilityLabel="Fechar mensagem">
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={16} tintColor="#A75D39" />
          </Pressable>
        </View>}

        <View style={styles.section}>
          <View style={styles.titleRow}>
            <Text style={styles.stepNumber}>01</Text>
            <Text style={styles.sectionTitle}>Cliente da visita</Text>
          </View>
          {selected ? <View style={styles.selectedClient}>
            <View style={styles.clientAvatar}><Text style={styles.avatarText}>{selected.nome.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.clientInfo}><Text style={styles.clientName}>{selected.nome}</Text><Text style={styles.clientSub}>{selected.telefone || 'Sem telefone informado'}</Text></View>
            <Pressable onPress={() => { setSelected(null); setQuery(''); }} accessibilityLabel="Trocar cliente">
              <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel' }} size={21} tintColor={colors.muted} />
            </Pressable>
          </View> : <>
            <View style={styles.searchBox}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={20} tintColor={colors.brandDark} />
              <TextInput style={styles.searchInput} value={query} onChangeText={setQuery}
                placeholder="Nome ou telefone" placeholderTextColor="#A09BB4" autoCorrect={false}
                accessibilityLabel="Pesquisar cliente"
                returnKeyType="search" />
              {searching ? <ActivityIndicator size="small" color={colors.brand} /> : null}
            </View>
            {query.trim().length < 2 ? <Text style={styles.hint}>Digite duas ou mais letras para procurar.</Text> : null}
            {query.trim().length >= 2 && !searching && !clients.length ? <Text style={styles.hint}>Nenhum cliente ativo localizado.</Text> : null}
            {clients.map(client => <Pressable key={client.id}
              onPress={() => { Keyboard.dismiss(); setSelected(client); setClients([]); Haptics.selectionAsync().catch(() => {}); }}
              style={styles.clientResult}>
              <View style={styles.clientAvatar}><Text style={styles.avatarText}>{client.nome.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.clientInfo}><Text style={styles.clientName}>{client.nome}</Text><Text style={styles.clientSub}>{client.telefone || 'Sem telefone'}</Text></View>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={20} tintColor={colors.muted} />
            </Pressable>)}
          </>}
        </View>

        <View style={styles.section}>
          <View style={styles.titleRow}>
            <Text style={styles.stepNumber}>02</Text>
            <Text style={styles.sectionTitle}>Equipe da visita</Text>
          </View>
          {loading ? <ActivityIndicator color={colors.brand} /> : <>
            <Text style={styles.fieldLabel}>Corretor responsável *</Text>
            <Pressable onPress={() => setSheet('main')} style={styles.selectBox} accessibilityRole="button">
              <Text style={[styles.selectValue, !mainName && styles.placeholder]}>{mainName || 'Selecionar corretor'}</Text>
              <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={18} tintColor={colors.brandDark} />
            </Pressable>
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Segundo corretor (opcional)</Text>
            <Pressable onPress={() => setSheet('second')} style={styles.selectBox} accessibilityRole="button">
              <Text style={[styles.selectValue, !secondName && styles.placeholder]}>{secondName || 'Nenhum'}</Text>
              <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={18} tintColor={colors.brandDark} />
            </Pressable>
          </>}
        </View>

        <Pressable style={[styles.primary, (saving || loading || !main || !selected) && styles.disabled]}
          disabled={saving || loading || !main || !selected} onPress={() => { void register(); }}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <>
            <Text style={styles.primaryText}>Confirmar chegada</Text>
            <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={19} tintColor="#FFFFFF" />
          </>}
        </Pressable>
        <Text style={styles.note}>O horário é registrado automaticamente e as permissões são conferidas no servidor. Esta etapa utiliza clientes já cadastrados.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    <ChoiceSheet open={sheet !== null}
      title={sheet === 'main' ? 'Corretor responsável' : 'Segundo corretor'}
      choices={brokers} selected={sheet === 'main' ? main : second} allowEmpty={sheet === 'second'}
      onClose={() => setSheet(null)} onChoose={value => {
        if (sheet === 'main') setMain(value);
        if (sheet === 'second') setSecond(value);
      }} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 40, flexGrow: 1 },
  header: { flexDirection: 'row', gap: 13, alignItems: 'center', marginBottom: 20 },
  back: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF' },
  eyebrow: { color: colors.brandDark, fontSize: 10, letterSpacing: 1.3, fontWeight: '900' },
  heading: { color: colors.ink, marginTop: 4, fontSize: 20, fontWeight: '900' },
  hero: { borderRadius: 26, backgroundColor: colors.navy, padding: 24, overflow: 'hidden', minHeight: 183 },
  orbit: { width: 220, height: 220, borderRadius: 110, backgroundColor: '#483377', position: 'absolute', right: -65, top: -85 },
  heroIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', letterSpacing: -0.5, marginTop: 13 },
  heroSub: { color: '#E6DBFF', fontSize: 12, lineHeight: 19, marginTop: 10 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7F0', padding: 14, borderRadius: 15, marginTop: 16 },
  feedbackText: { flex: 1, color: '#92562F', lineHeight: 18, fontSize: 12 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 23, padding: 19, marginTop: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 19 },
  stepNumber: { width: 30, height: 30, borderRadius: 11, backgroundColor: colors.pale, color: colors.brandDark, textAlign: 'center', textAlignVertical: 'center', fontSize: 11, fontWeight: '900', overflow: 'hidden' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  searchBox: { height: 52, borderRadius: 15, borderWidth: 1, borderColor: '#D9D0FF', backgroundColor: '#FAF9FF', flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, height: '100%' },
  hint: { color: colors.muted, marginTop: 12, lineHeight: 19, fontSize: 12 },
  clientResult: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  selectedClient: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, padding: 11, backgroundColor: colors.pale },
  clientAvatar: { width: 40, height: 40, backgroundColor: '#D8CEFF', borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontWeight: '800', fontSize: 17, color: colors.brandDark },
  clientInfo: { flex: 1 },
  clientName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  clientSub: { color: colors.muted, fontSize: 11, marginTop: 4 },
  fieldLabel: { color: colors.ink, fontWeight: '800', fontSize: 12, marginBottom: 8 },
  selectBox: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FAF9FF' },
  selectValue: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' },
  placeholder: { color: colors.muted, fontWeight: '500' },
  primary: { marginTop: 23, minHeight: 56, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 17 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 16, paddingHorizontal: 15 },
});
