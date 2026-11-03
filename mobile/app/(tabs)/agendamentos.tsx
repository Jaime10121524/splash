import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { apiRequest, MobileClient, MobileVisitOptions } from '../../src/api';
import BookingInvite, { type Booking } from '../../src/components/BookingInvite';
import ChoiceSheet from '../../src/components/ChoiceSheet';
import ActionModal from '../../src/components/ActionModal';
import ToastNotice from '../../src/components/ToastNotice';
import { editMaskedPhoneBR, maskPhoneBR, phoneDigits } from '../../src/phone';
import { useAuth } from '../../src/AuthContext';
import { colors } from '../../src/theme';

type ScreenMode = 'list' | 'create' | 'scan' | 'confirm';
type PickerName = 'captor' | 'broker' | 'second' | 'attendant' | 'client' | null;
type Metrics = { agendados: number; compareceram: number; nao_compareceram: number; vendas: number; taxa_comparecimento: number; taxa_fechamento: number };

function todayPlus(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateBR(value: string) {
  const parts = value.split('-');
  return parts.length === 3 ? parts.reverse().join('/') : value;
}
function dateISO(value: string): string | null {
  const parts = value.trim().split('/');
  if (parts.length !== 3) return null;
  const d = new Date(Date.UTC(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])));
  const iso = parts[2] + '-' + parts[1] + '-' + parts[0];
  return d.getUTCFullYear() === Number(parts[2]) && d.getUTCMonth() === Number(parts[1]) - 1
    && d.getUTCDate() === Number(parts[0]) ? iso : null;
}

export default function AgendamentosScreen({ initialMode = 'list' }: { initialMode?: 'list' | 'scan' }) {
  const { token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const lockedScan = useRef(false);
  const formScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollFormToBottom = () => {
    setTimeout(() => formScroll.current?.scrollToEnd({ animated: true }), 220);
  };
  const [mode, setMode] = useState<ScreenMode>(initialMode);
  const [rows, setRows] = useState<Booking[]>([]);
  const [stats, setStats] = useState<Metrics | null>(null);
  const [options, setOptions] = useState<MobileVisitOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [invite, setInvite] = useState<Booking | null>(null);
  const [success, setSuccess] = useState<{ title: string; description: string; visitId?: number } | null>(null);
  const [picker, setPicker] = useState<PickerName>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(dateBR(todayPlus(0)));
  const [people, setPeople] = useState('1');
  const [captor, setCaptor] = useState<number | null>(null);

  const [current, setCurrent] = useState<Booking | null>(null);
  const [scannedQr, setScannedQr] = useState('');
  const [broker, setBroker] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [attendant, setAttendant] = useState<number | null>(null);
  const [clients, setClients] = useState<MobileClient[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      // A agenda depende de migração própria. Mesmo que falhe, a lista de
      // corretores do módulo de visitas deve continuar disponível no formulário.
      const [bookingResult, peopleResult] = await Promise.allSettled([
        apiRequest<{ agendamentos: Booking[]; indicadores: Metrics }>('mobile/agendamentos', { token }),
        apiRequest<MobileVisitOptions>('mobile/atendimento-opcoes', { token }),
      ]);
      if (bookingResult.status === 'fulfilled') {
        setRows(bookingResult.value.agendamentos);
        setStats(bookingResult.value.indicadores);
      } else {
        setRows([]);
        setStats(null);
      }
      if (peopleResult.status === 'fulfilled') {
        const data = peopleResult.value;
        setOptions(data);
        setCaptor(current => current ?? data.minha_pessoa_id
          ?? (data.corretores.length === 1 ? data.corretores[0].id : null));
      } else {
        setOptions(null);
      }
      const failures = [
        bookingResult.status === 'rejected' ?
          (bookingResult.reason instanceof Error ? bookingResult.reason.message : 'Erro ao consultar agenda.') : '',
        peopleResult.status === 'rejected' ?
          (peopleResult.reason instanceof Error ? peopleResult.reason.message : 'Erro ao carregar corretores.') : '',
      ].filter(Boolean);
      setError(failures.join(' '));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useFocusEffect(useCallback(() => {
    if (initialMode === 'scan') {
      lockedScan.current = false;
      setError('');
      setMode('scan');
    }
  }, [initialMode]));
  useEffect(() => {
    if (initialMode === 'scan' && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [initialMode, permission?.granted, permission?.canAskAgain, requestPermission]);

  function chooseBooking(booking: Booking, qr: string) {
    setCurrent(booking); setScannedQr(qr); setBroker(booking.corretor_confirmado_pessoa_id || booking.captador_pessoa_id);
    setSecond(booking.segundo_corretor_pessoa_id || null); setAttendant(booking.atendente_pessoa_id || null);
    setClientId(booking.cliente_id || null); setClientQuery(booking.telefone); setClients([]);
    setError(''); setMode('confirm');
  }
  async function inspectQr(qr: string) {
    if (busy) return;
    setBusy(true);setError('');
    try {
      const result = await apiRequest<{ agendamento: Booking }>('mobile/agendamentos/validar-qr', {
        token, method: 'POST', body: { qr },
      });
      if (result.agendamento.situacao !== 'AGENDADO') {
        setError('Este código já foi utilizado ou o agendamento foi cancelado.');
        setMode('list');
      } else { chooseBooking(result.agendamento, qr); }
    } catch (e) { setError(e instanceof Error ? e.message : 'QR Code inválido.');setMode('list'); }
    finally { setBusy(false); }
  }
  async function scanQr(data: string) {
    if (lockedScan.current) return;
    lockedScan.current = true;
    Haptics.selectionAsync().catch(() => {});
    setMode('list'); // desmonta a câmera antes de abrir a conferência
    await inspectQr(data);
    lockedScan.current = false;
  }

  async function create() {
    const iso = dateISO(date);
    if (!name.trim() || ![10,11].includes(phoneDigits(phone).length) || !iso
        || iso < todayPlus(0) || !captor || !Number.isInteger(Number(people))
        || Number(people) < 1 || Number(people)>100) {
      setError('Informe nome, telefone com DDD, data válida, pessoas e corretor.');
      return;
    }
    setBusy(true);setError('');Keyboard.dismiss();
    try {
      const r = await apiRequest<{ agendamento_id: number; qr_payload: string }>('mobile/agendamentos', {
        method: 'POST', token, body: {
          nome_completo: name.trim(), telefone: phoneDigits(phone), data_visita: iso,
          quantidade_pessoas: Number(people), captador_pessoa_id: captor,
        },
      });
      const newBooking: Booking = {
        id: r.agendamento_id, qr_token: r.qr_payload.split(':').pop() || '',
        nome_completo: name.trim(), telefone: phoneDigits(phone), data_visita: iso,
        quantidade_pessoas: Number(people), captador_pessoa_id: captor,
        captador_nome: options?.corretores.find(v => v.id === captor)?.nome || null,
        situacao: 'AGENDADO',
      };
      await refresh();setMode('list');setInvite(newBooking);
      setName('');setPhone('');setDate(dateBR(todayPlus(0)));setPeople('1');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao agendar.'); }
    finally { setBusy(false); }
  }

  async function searchClients() {
    if (!token || clientQuery.trim().length < 2) return;
    setBusy(true);setError('');
    try {
      const result = await apiRequest<{ clientes: MobileClient[] }>(
        'mobile/clientes?q=' + encodeURIComponent(clientQuery.trim()), { token });
      setClients(result.clientes);
      if (!result.clientes.length) setNotice('Nenhum cliente localizado com esta pesquisa.');
    } catch(e) { setError(e instanceof Error ? e.message : 'Erro ao consultar clientes.'); }
    finally { setBusy(false); }
  }

  async function checkin() {
    if (!token || !current || !scannedQr || !broker || !attendant || broker===second) {
      setError('Confirme o corretor e selecione o atendente.');
      return;
    }
    setBusy(true);setError('');
    try {
      const result = await apiRequest<{ visita_id: number; message: string }>(
        'mobile/agendamentos/' + current.id + '/checkin', {
          method: 'POST', token, body: {
            qr: scannedQr, corretor_pessoa_id: broker,
            segundo_corretor_pessoa_id: second, atendente_pessoa_id: attendant,
            cliente_id: clientId,
          },
        },
      );
      setMode('list');setCurrent(null);await refresh();
      setSuccess({ title:'Chegada registrada!', description:result.message, visitId:result.visita_id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível realizar o check-in.'); }
    finally { setBusy(false); }
  }

  const brokers = options?.corretores || [];
  const attendants = options?.atendentes || [];
  const title = mode === 'create' ? 'Nova visita agendada'
    : mode === 'scan' ? 'Registrar chegada'
    : mode === 'confirm' ? 'Confirmar chegada' : 'Agendamentos';
  const list = rows.filter(r => !search.trim()
    || r.nome_completo.toLowerCase().includes(search.trim().toLowerCase())
    || String(r.id).includes(search.trim())
    || (phoneDigits(search).length >= 3 && r.telefone.includes(phoneDigits(search))));
  const select = (caption: string, value: string, action: () => void) =>
    <Pressable onPress={() => { Keyboard.dismiss(); action(); }} accessibilityRole="button" style={styles.selector}>
      <View style={{flex:1}}><Text style={styles.caption}>{caption}</Text>
        <Text style={styles.selectValue}>{value||'Selecionar'}</Text></View>
      <SymbolView name={{ios:'chevron.up.chevron.down',android:'unfold_more'}} tintColor={colors.brandDark} size={19}/>
    </Pressable>;

  return <SafeAreaView style={styles.root} edges={['top']}>
    <View style={styles.top}><Text style={styles.topTitle}>{title}</Text>
      {mode!=='list'&&<Pressable onPress={()=>{
        if (initialMode==='scan') router.replace('/(tabs)/agendamentos');
        else setMode('list');
        setError('');
      }}
        style={styles.back} accessibilityLabel="Voltar">
        <SymbolView name={{ios:'xmark',android:'close'}} tintColor={colors.ink} size={21}/>
      </Pressable>}</View>
    <KeyboardAvoidingView style={styles.scrollArea}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
    <ScrollView ref={formScroll} style={styles.scrollArea}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      contentContainerStyle={styles.content}
      refreshControl={mode==='list'?<RefreshControl refreshing={loading} onRefresh={()=>{setLoading(true);void refresh();}} tintColor={colors.brand} />:undefined}>
      {error!==''&&<View style={styles.feedback}><Text style={styles.feedbackText}>{error}</Text>
        <Pressable onPress={()=>setError('')} accessibilityLabel="Fechar aviso"><SymbolView name={{ios:'xmark',android:'close'}} size={17} tintColor="#9B663B"/></Pressable>
      </View>}

      {mode==='list'&&<>
        <View style={styles.hero}><Text style={styles.eyebrow}>FUNIL DE LEADS</Text>
          <Text style={styles.heroTitle}>Da agenda{'\n'}ao resultado.</Text>
          <Text style={styles.heroSub}>Convites com QR, presença e vendas no mesmo lugar.</Text>
        </View>
        <View style={styles.metrics}>
          {([['agendados','Agendados'],['compareceram','Presentes'],['vendas','Fechamentos']] as const)
            .map(([k,label])=><View style={styles.metric} key={k}><Text style={styles.metricValue}>{stats?.[k]??'—'}</Text>
              <Text style={styles.metricName}>{label}</Text></View>)}
        </View>
        <View style={styles.buttons}>
          <Pressable style={styles.primary} onPress={()=>{setMode('create');setError('');}}>
            <SymbolView name={{ios:'plus',android:'add'}} tintColor="#FFFFFF" size={19}/>
            <Text style={styles.primaryText}>Novo agendamento</Text></Pressable>
          <Pressable style={styles.cameraButton} onPress={async()=>{
            const permissionResult = permission?.granted ? permission : await requestPermission();
            if(permissionResult?.granted){lockedScan.current=false;setMode('scan');setError('');}
            else setError('Permita o uso da câmera para ler QR Codes.');
          }}>
            <SymbolView name={{ios:'qrcode.viewfinder',android:'qr_code_scanner'}} tintColor={colors.brandDark} size={22}/>
          </Pressable>
        </View>
        <TextInput style={styles.search} value={search} onChangeText={setSearch}
          placeholder="Buscar por nome ou nº" placeholderTextColor={colors.muted}/>
        {loading&&<ActivityIndicator color={colors.brand} style={{marginTop:23}}/>}
        {!loading&&!list.length&&<Text style={styles.empty}>Nenhum agendamento encontrado.</Text>}
        {list.map(row=><View style={styles.card} key={row.id}>
          <View style={styles.cardTop}>
            <Text style={styles.clientName} numberOfLines={2}>{row.nome_completo}</Text>
            <Text style={styles.number}>#{row.id}</Text></View>
          <Text style={styles.cardDetail}>{dateBR(row.data_visita)} · {row.quantidade_pessoas} pessoa(s)</Text>
          <Text style={styles.cardDetail}>{maskPhoneBR(row.telefone)}</Text>
          <Text style={styles.cardDetail}>Captado por {row.captador_nome||'corretor responsável'}</Text>
          <View style={styles.cardBottom}>
            <View style={[styles.status,row.situacao==='COMPARECEU'&&styles.present]}>
              <Text style={[styles.statusText,row.situacao==='COMPARECEU'&&styles.presentText]}>
                {row.situacao==='COMPARECEU'?'Compareceu':row.situacao==='CANCELADO'?'Cancelado':'Agendado'}
              </Text></View>
            <Pressable style={styles.qrButton} onPress={()=>setInvite(row)}>
              <SymbolView name={{ios:'qrcode',android:'qr_code'}} tintColor={colors.brandDark} size={18}/>
              <Text style={styles.qrText}>Convite</Text></Pressable>
            {row.situacao==='AGENDADO'&&<Pressable onPress={()=>{void inspectQr('SPLASH:AG:1:'+row.qr_token);}}
              style={styles.qrButton}><Text style={styles.qrText}>Receber</Text></Pressable>}
            {row.visita_id&&<Pressable style={styles.qrButton} onPress={()=>router.push({
              pathname:'/atendimento/[id]',params:{id:String(row.visita_id)},
            })}><Text style={styles.qrText}>Visita</Text></Pressable>}
          </View>
        </View>)}
      </>}
      {mode==='create'&&<>
        <Text style={styles.instructions}>Cadastre o compromisso. A imagem com QR Code será aberta para compartilhar em seguida.</Text>
        <View style={styles.form}>
          <Text style={styles.label}>Nome completo *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words"
            placeholder="Nome do visitante" placeholderTextColor={colors.muted} maxLength={160}/>
          <Text style={styles.label}>Telefone com DDD *</Text>
          <TextInput style={styles.input} value={phone} maxLength={20}
            onChangeText={v=>setPhone(p=>editMaskedPhoneBR(p,v))} keyboardType="phone-pad"
            placeholder="(21) 99999-9999" placeholderTextColor={colors.muted}/>
          <Text style={styles.label}>Data da visita *</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate}
            onFocus={scrollFormToBottom}
            keyboardType="numbers-and-punctuation" maxLength={10}
            placeholder="DD/MM/AAAA" placeholderTextColor={colors.muted}/>
          <View style={styles.dateButtons}>
            <Pressable onPress={()=>setDate(dateBR(todayPlus(0)))}><Text style={styles.quickText}>Hoje</Text></Pressable>
            <Pressable onPress={()=>setDate(dateBR(todayPlus(1)))}><Text style={styles.quickText}>Amanhã</Text></Pressable>
            <Pressable onPress={()=>setDate(dateBR(todayPlus(7)))}><Text style={styles.quickText}>+7 dias</Text></Pressable>
          </View>
          <Text style={styles.label}>Quantidade de pessoas *</Text>
          <View style={styles.counter} accessibilityLabel="Quantidade de pessoas">
            <Pressable accessibilityRole="button" accessibilityLabel="Diminuir quantidade de pessoas"
              disabled={Number(people) <= 1} style={[styles.counterButton,Number(people)<=1&&styles.counterDisabled]}
              onPress={() => setPeople(value => String(Math.max(1, Number(value) - 1)))}>
              <SymbolView name={{ios:'minus',android:'remove'}} tintColor={colors.brandDark} size={20}/>
            </Pressable>
            <View style={styles.counterCenter}>
              <Text style={styles.counterValue}>{people}</Text>
              <Text style={styles.counterCaption}>{Number(people) === 1 ? 'pessoa' : 'pessoas'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Aumentar quantidade de pessoas"
              disabled={Number(people)>=100} style={[styles.counterButton,Number(people)>=100&&styles.counterDisabled]}
              onPress={() => setPeople(value => String(Math.min(100, Number(value) + 1)))}>
              <SymbolView name={{ios:'plus',android:'add'}} tintColor={colors.brandDark} size={20}/>
            </Pressable>
          </View>
          {loading && <ActivityIndicator color={colors.brand} />}
          {select('Corretor que captou *',brokers.find(v=>v.id===captor)?.nome||'',()=>setPicker('captor'))}
          {!loading&&brokers.length===0&&<Text style={styles.brokerHint}>
            Não há corretores ativos disponíveis. Confira o cadastro de Pessoas e suas funções no sistema do PC.
          </Text>}
        </View>
        <Pressable style={[styles.primary,styles.save,busy&&styles.disabled]} disabled={busy} onPress={()=>{void create();}}>
          {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={styles.primaryText}>Salvar e gerar convite QR</Text>}
        </Pressable>
      </>}
      {mode==='scan'&&<View>
        <Text style={styles.instructions}>Leia o QR Code do voucher para confirmar a chegada. Isso não inicia o atendimento.</Text>
        <View style={styles.cameraWrap}>
          {permission?.granted?<CameraView style={styles.camera} facing="back"
            barcodeScannerSettings={{barcodeTypes:['qr']}}
            onBarcodeScanned={event=>{void scanQr(event.data);}}/>:
            <View style={styles.cameraPermission}>
              <Text style={styles.cameraPermissionText}>Permita o acesso à câmera para registrar a chegada.</Text>
              <Pressable style={styles.permissionButton} onPress={()=>{void requestPermission();}}>
                <Text style={styles.primaryText}>Permitir câmera</Text>
              </Pressable>
            </View>}
          <View pointerEvents="none" style={styles.cameraOutline}/>
        </View>
      </View>}
      {mode==='confirm'&&current&&<>
        <View style={styles.hero}><Text style={styles.eyebrow}>CONFIRA O LEAD</Text>
          <Text style={styles.heroTitle}>{current.nome_completo}</Text>
          <Text style={styles.heroSub}>{dateBR(current.data_visita)} · {current.quantidade_pessoas} pessoa(s)</Text>
          <Text style={styles.heroSub}>Captado por: {current.captador_nome||'Corretor cadastrado'}</Text>
        </View>
        <Text style={styles.instructions}>Registre somente a chegada. O cliente ficará aguardando; o atendimento será iniciado separadamente. Confira corretor(es) e atendente.</Text>
        <View style={styles.form}>
          {select('Corretor que está recebendo *',brokers.find(v=>v.id===broker)?.nome||'',()=>setPicker('broker'))}
          {select('Segundo corretor (opcional)',brokers.find(v=>v.id===second)?.nome||'Nenhum',()=>setPicker('second'))}
          {select('Quem vai atender? *',attendants.find(v=>v.id===attendant)?.nome||'',()=>setPicker('attendant'))}
          <View style={styles.clientLookup}>
            <Text style={styles.label}>Vincular cliente existente (opcional)</Text>
            <TextInput style={styles.input} value={clientQuery} onChangeText={setClientQuery}
              onFocus={scrollFormToBottom}
              placeholder="Nome ou telefone" placeholderTextColor={colors.muted}/>
            <Pressable onPress={()=>{void searchClients();}} style={styles.searchClient}><Text style={styles.quickText}>Localizar cliente</Text></Pressable>
            {clients.length>0&&select('Cadastro do cliente',
              clients.find(v=>v.id===clientId)?.nome||'Criar novo cadastro',
              ()=>setPicker('client'))}
            {clientId&&<Pressable onPress={()=>setClientId(null)}><Text style={styles.quickText}>Não vincular este cliente</Text></Pressable>}
          </View>
        </View>
        <Pressable style={[styles.primary,styles.save,busy&&styles.disabled]} disabled={busy} onPress={()=>{void checkin();}}>
          {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={styles.primaryText}>Confirmar chegada</Text>}
        </Pressable>
      </>}
    </ScrollView>
    </KeyboardAvoidingView>
    <ChoiceSheet open={picker!==null}
      title={picker==='captor'?'Corretor que captou':picker==='broker'?'Corretor responsável'
        :picker==='second'?'Segundo corretor':picker==='attendant'?'Atendente':'Cliente'}
      choices={picker==='client'?clients.map(v=>({id:v.id,label:v.nome})):
        picker==='attendant'?attendants.map(v=>({id:v.id,label:v.nome})):
        brokers.filter(v=>picker!=='second'||v.id!==broker).map(v=>({id:v.id,label:v.nome}))}
      selected={picker==='captor'?captor:picker==='broker'?broker:picker==='second'?second:
        picker==='attendant'?attendant:clientId}
      allowEmpty={picker==='second'||picker==='client'}
      onChoose={value=>{
        if(picker==='captor')setCaptor(value);
        if(picker==='broker'){setBroker(value);if(value===second)setSecond(null);}
        if(picker==='second')setSecond(value);
        if(picker==='attendant')setAttendant(value);
        if(picker==='client')setClientId(value);
      }} onClose={()=>setPicker(null)}/>
    <BookingInvite booking={invite} onClose={()=>setInvite(null)}/>
    <ToastNotice message={notice} onDismiss={()=>setNotice('')}/>
    <ActionModal visible={success!==null} variant="success"
      title={success?.title||'Chegada registrada'}
      description={success?.description||''} primaryLabel="Ver ficha da visita"
      secondaryLabel="Voltar à agenda"
      onPrimary={()=>{const visit=success?.visitId;setSuccess(null);if(visit)router.push({
        pathname:'/atendimento/[id]',params:{id:String(visit)},
      });}}
      onSecondary={()=>setSuccess(null)}/>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  scrollArea:{flex:1},
  top:{paddingHorizontal:19,paddingTop:18,paddingBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  topTitle:{color:colors.ink,fontWeight:'900',fontSize:23},
  back:{width:37,height:37,backgroundColor:'#FFFFFF',borderRadius:12,alignItems:'center',justifyContent:'center'},
  content:{paddingHorizontal:19,paddingBottom:105,flexGrow:1},
  feedback:{backgroundColor:'#FFF2EA',padding:13,borderRadius:14,marginBottom:12,flexDirection:'row',gap:10,alignItems:'center'},
  feedbackText:{color:'#9B663B',flex:1,fontSize:12,lineHeight:18},
  notice:{backgroundColor:colors.pale,padding:12,borderRadius:12,marginBottom:9},
  noticeText:{color:colors.brandDark,fontSize:12},
  hero:{backgroundColor:colors.navy,borderRadius:23,padding:22,marginTop:6},
  eyebrow:{fontSize:10,color:'#CABEFF',fontWeight:'900',letterSpacing:1.5},
  heroTitle:{color:'#FFFFFF',fontSize:25,fontWeight:'900',marginTop:10},
  heroSub:{color:'#D9CFFF',fontSize:12,marginTop:8,lineHeight:19},
  metrics:{flexDirection:'row',gap:8,marginTop:13},
  metric:{flex:1,backgroundColor:'#FFFFFF',borderRadius:15,paddingVertical:15,alignItems:'center'},
  metricValue:{color:colors.brandDark,fontWeight:'900',fontSize:22},
  metricName:{color:colors.muted,fontSize:10,marginTop:5},
  buttons:{flexDirection:'row',gap:10,marginTop:17},
  primary:{backgroundColor:colors.brand,minHeight:53,borderRadius:16,flexDirection:'row',
    alignItems:'center',justifyContent:'center',gap:10,flex:1,paddingHorizontal:14},
  primaryText:{color:'#FFFFFF',fontWeight:'900',fontSize:13},
  cameraButton:{height:53,width:55,backgroundColor:colors.pale,borderRadius:16,alignItems:'center',justifyContent:'center'},
  search:{marginTop:20,height:50,borderRadius:15,backgroundColor:'#FFFFFF',paddingHorizontal:15,
    fontSize:13,color:colors.ink,borderWidth:1,borderColor:colors.line},
  empty:{textAlign:'center',color:colors.muted,padding:24,fontSize:13},
  card:{backgroundColor:'#FFFFFF',padding:17,borderRadius:19,marginTop:12,borderWidth:1,borderColor:colors.line},
  cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:8},
  clientName:{color:colors.ink,fontSize:15,fontWeight:'900',flex:1},
  number:{color:colors.brandDark,fontSize:11,fontWeight:'800'},
  cardDetail:{color:colors.muted,fontSize:12,marginTop:7},
  cardBottom:{flexDirection:'row',alignItems:'center',gap:12,marginTop:13,flexWrap:'wrap'},
  status:{paddingHorizontal:11,paddingVertical:7,backgroundColor:colors.pale,borderRadius:14},
  present:{backgroundColor:'#E7F6ED'},
  statusText:{fontWeight:'800',color:colors.brandDark,fontSize:11},
  presentText:{color:'#35765B'},
  qrButton:{flexDirection:'row',gap:4,alignItems:'center'},
  qrText:{color:colors.brandDark,fontSize:12,fontWeight:'800'},
  instructions:{color:colors.muted,lineHeight:20,fontSize:12,marginVertical:15},
  form:{padding:18,borderRadius:23,backgroundColor:'#FFFFFF',gap:10},
  label:{fontSize:12,fontWeight:'800',color:colors.ink,marginTop:8},
  input:{height:51,backgroundColor:'#FAF9FF',borderWidth:1,borderColor:colors.line,borderRadius:14,
    paddingHorizontal:14,color:colors.ink,fontSize:14},
  selector:{minHeight:62,marginTop:8,borderRadius:15,borderWidth:1,borderColor:colors.line,
    backgroundColor:'#FAF9FF',paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:8},
  caption:{color:colors.muted,fontSize:10,fontWeight:'700'},
  selectValue:{color:colors.ink,fontWeight:'800',marginTop:6,fontSize:13},
  dateButtons:{flexDirection:'row',gap:16,marginTop:3},
  counter:{minHeight:62,flexDirection:'row',alignItems:'center',gap:9,
    borderRadius:16,borderWidth:1,borderColor:colors.line,padding:6,backgroundColor:'#FAF9FF'},
  counterButton:{width:49,height:49,borderRadius:13,backgroundColor:colors.pale,
    alignItems:'center',justifyContent:'center'},
  counterDisabled:{opacity:0.35},
  counterCenter:{flex:1,alignItems:'center',justifyContent:'center'},
  counterValue:{color:colors.ink,fontSize:22,fontWeight:'900'},
  counterCaption:{color:colors.muted,fontSize:10,fontWeight:'700'},
  brokerHint:{fontSize:12,color:'#A06343',lineHeight:19,marginTop:6},
  quickText:{color:colors.brandDark,fontSize:12,fontWeight:'800'},
  save:{marginTop:17},
  disabled:{opacity:.6},
  cameraWrap:{height:390,backgroundColor:'#1E1239',borderRadius:23,overflow:'hidden',justifyContent:'center'},
  camera:{width:'100%',height:'100%'},
  cameraOutline:{borderWidth:3,borderColor:'#D1BFFF',borderRadius:26,position:'absolute',
    top:69,left:55,right:55,bottom:69},
  cameraPermission:{padding:25,alignItems:'center',justifyContent:'center'},
  cameraPermissionText:{color:'#FFFFFF',textAlign:'center',fontSize:14,lineHeight:22,marginBottom:18},
  permissionButton:{backgroundColor:colors.brand,paddingVertical:13,paddingHorizontal:18,borderRadius:15},
  clientLookup:{marginTop:9,borderTopWidth:1,borderTopColor:colors.line,paddingTop:9},
  searchClient:{alignSelf:'flex-end',paddingVertical:11},
});
