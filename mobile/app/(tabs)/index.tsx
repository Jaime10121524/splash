import {useThemedStyles} from '../../src/ThemeContext';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { ApiError, VisitData, apiRequest, mobileMediaUrl, roleName } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import VisitCard from '../../src/components/VisitCard';
import { colors, shadows } from '../../src/theme';

function Metric({ label, number, icon, tint }: { label: string; number: number; icon: 'clock' | 'people' | 'check'; tint: string }) {
  const styles=useThemedStyles(lightStyles);
  const symbols = {
    clock: { ios: 'clock', android: 'schedule' },
    people: { ios: 'person.2.fill', android: 'groups' },
    check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  } as const;
  return <View style={styles.metric}>
    <View style={[styles.metricIcon, { backgroundColor: tint + '15' }]}>
      <SymbolView name={symbols[icon]} size={19} tintColor={tint} />
    </View>
    <Text style={styles.metricNumber}>{number}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

export default function HomeScreen() {
  const router=useRouter();
  const styles=useThemedStyles(lightStyles);
  const { user, token } = useAuth();
  const [data, setData] = useState<VisitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [unread, setUnread] = useState(0);
  const [photo, setPhoto] = useState(true);
  const [photoKey, setPhotoKey] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const value = await apiRequest<VisitData>('mobile/atendimentos?periodo=hoje', { token });
      setData(value); setError(''); setForbidden(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else setError(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => {
    void load();
    setPhoto(true);setPhotoKey(v=>v+1);
    if(token)void apiRequest<{nao_lidas:number}>('mobile/notificacoes',{token})
      .then(n=>setUnread(n.nao_lidas||0)).catch(()=>{});
  }, [load,token]));
  async function refresh() { setRefreshing(true); await load(); }
  function openVisits() { Haptics.selectionAsync().catch(() => {}); router.push('/(tabs)/atendimentos'); }

  const firstName = user?.username?.split(/[.\s_-]/)[0] || 'você';
  const today = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());

  return <SafeAreaView style={styles.root} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>BOM TE VER POR AQUI</Text>
          <Text style={styles.title}>Olá, {firstName}! <Text>👋</Text></Text>
          <Text style={styles.date}>{today}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.bell} onPress={()=>router.push('/notificacoes')}
            accessibilityRole="button" accessibilityLabel={'Notificações: '+unread+' não lidas'}>
            <SymbolView name={{ios:'bell.fill',android:'notifications'}} size={22} tintColor={colors.brandDark}/>
            {!!unread&&<View style={styles.bellCount}><Text style={styles.bellText}>{unread>99?'99+':unread}</Text></View>}
          </Pressable>
          <Pressable style={styles.avatar} onPress={() => router.push('/perfil')}
            accessibilityRole="button" accessibilityLabel="Abrir meu perfil">
            {photo&&token?<Image source={{uri:mobileMediaUrl('mobile/me/foto')+'?v='+photoKey,
                headers:{Authorization:'Bearer '+token}}} style={styles.avatarImage}
                onError={()=>setPhoto(false)}/>:
              <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>}
          </Pressable>
        </View>
      </View>
      <View style={styles.hero}>
        <View style={styles.heroCircle} />
        <Text style={styles.heroEyebrow}>SEU DIA NO SPLASH</Text>
        <Text style={styles.heroTitle}>Mais foco no que{'\n'}realmente importa.</Text>
        <Text style={styles.heroText}>Acompanhe suas atividades com praticidade.</Text>
      </View>
      <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>Atendimentos de hoje</Text></View>
      {loading ? <ActivityIndicator style={{ marginTop: 25 }} size="large" color={colors.brand} /> : forbidden ? (
        <View style={styles.info}><Text style={styles.infoText}>Seu perfil não tem acesso aos atendimentos. Outras áreas serão disponibilizadas nas próximas etapas.</Text></View>
      ) : error ? (
        <View style={styles.info}><Text style={styles.infoText}>{error}</Text><Pressable onPress={load}><Text style={styles.retry}>Tentar novamente</Text></Pressable></View>
      ) : data ? <>
        <View style={styles.metrics}>
          <Metric label="Aguardando" number={data.indicadores.aguardando} icon="clock" tint="#D38B26" />
          <Metric label="Em atendimento" number={data.indicadores.atendendo} icon="people" tint="#428ECE" />
          <Metric label="Concluídos" number={data.indicadores.retorno + data.indicadores.sem_venda + data.indicadores.pendencia + data.indicadores.venda} icon="check" tint={colors.brandDark} />
        </View>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Atividade recente</Text>
          <Pressable onPress={openVisits} accessibilityRole="button"><Text style={styles.link}>Ver tudo</Text></Pressable>
        </View>
        {data.visitas.length ? data.visitas.slice(0, 4).map(visit => <VisitCard key={visit.id} visit={visit} compact
          onPress={() => router.push({ pathname: '/atendimento/[id]', params: { id: String(visit.id) } })} />)
          : <View style={styles.info}><Text style={styles.infoText}>Nenhum atendimento registrado hoje.</Text></View>}
        <Pressable style={styles.action} onPress={openVisits}>
          <View style={styles.actionIcon}><SymbolView name={{ ios: 'list.bullet.clipboard', android: 'assignment' }} size={22} tintColor={colors.brandDark} /></View>
          <View style={{ flex: 1 }}><Text style={styles.actionTitle}>Meus atendimentos</Text><Text style={styles.actionSubtitle}>Consulte e acompanhe suas visitas</Text></View>
          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={20} tintColor={colors.muted} />
        </Pressable>
      </> : null}
      <View style={{ height: 20 }} />
    </ScrollView>
  </SafeAreaView>;
}

const lightStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 35 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3, color: colors.brandDark },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.6, marginTop: 7 },
  date: { color: colors.muted, fontSize: 13, marginTop: 7 },
  headerActions:{flexDirection:'row',alignItems:'center',gap:8},
  bell:{width:45,height:45,borderRadius:15,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
  bellCount:{position:'absolute',top:-4,right:-4,backgroundColor:'#E43D67',borderRadius:13,
    minWidth:19,height:19,paddingHorizontal:3,alignItems:'center',justifyContent:'center'},
  bellText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},
  avatarImage:{width:46,height:46,borderRadius:16},
  avatar: { width: 46, height: 46, borderRadius: 16, overflow:'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
  avatarText: { color: colors.brandDark, fontWeight: '900', fontSize: 20 },
  hero: { backgroundColor: colors.navy, borderRadius: 26, padding: 23, minHeight: 167, overflow: 'hidden' },
  heroCircle: { width: 175, height: 175, borderRadius: 100, backgroundColor: '#4A3889', opacity: 0.5, position: 'absolute', top: -59, right: -67 },
  heroEyebrow: { color: '#D5C9FF', fontSize: 10, letterSpacing: 1.4, fontWeight: '900' },
  heroTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 22, lineHeight: 28, letterSpacing: -0.4, marginTop: 12 },
  heroText: { color: '#E7E0FF', marginTop: 10, fontSize: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 13 },
  sectionTitle: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  link: { color: colors.brandDark, fontWeight: '800', fontSize: 12 },
  metrics: { flexDirection: 'row', gap: 9 },
  metric: { flex: 1, padding: 12, backgroundColor: '#FFFFFF', borderRadius: 18, ...shadows.card },
  metricIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricNumber: { color: colors.ink, fontSize: 25, fontWeight: '900', marginTop: 12 },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 4, lineHeight: 13 },
  info: { borderColor: colors.line, borderWidth: 1, backgroundColor: '#FFFFFF', padding: 22, borderRadius: 20 },
  infoText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  retry: { color: colors.brandDark, marginTop: 13, fontWeight: '800' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 15, padding: 15, borderRadius: 19, backgroundColor: '#FFFFFF' },
  actionIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  actionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 4 },
});
