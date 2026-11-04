import {useThemedStyles} from '../../src/ThemeContext';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { apiRequest, MobileClient, MobileVisitOptions } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import ChoiceSheet from '../../src/components/ChoiceSheet';
import ActionModal from '../../src/components/ActionModal';
import ResumeAttendantModal from '../../src/components/ResumeAttendantModal';
import ClientPickerModal from '../../src/components/ClientPickerModal';
import { editMaskedPhoneBR, maskPhoneBR, phoneDigits } from '../../src/phone';
import { colors } from '../../src/theme';

type BrokerField = 'main' | 'second' | 'origin' | 'owner' | null;

export default function NewVisitScreen() {
  const styles=useThemedStyles(lightStyles);
  const { token, user } = useAuth();
  const admin = !!user?.groups?.includes('admin');
  const [options, setOptions] = useState<MobileVisitOptions | null>(null);
  const [selected, setSelected] = useState<MobileClient | null>(null);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [extraFields, setExtraFields] = useState(false);
  const [originId, setOriginId] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [indicator, setIndicator] = useState<MobileClient | null>(null);
  const [indicatorPickerOpen, setIndicatorPickerOpen] = useState(false);
  const [bonificacaoReg, setBonificacaoReg] = useState(false);
  const [bonificacaoValor, setBonificacaoValor] = useState('');
  const [bonificacaoPaga, setBonificacaoPaga] = useState(false);
  const [registeredVisit, setRegisteredVisit] = useState<{ id: number; title: string; description: string } | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<{
    id: number;
    attendantId: number | null;
    attendantName: string | null;
  } | null>(null);
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
        setOwnerId(value.minha_pessoa_id);
      })
      .catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'Não foi possível carregar os corretores.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    if (!token || clientMode !== 'existing' || query.trim().length < 2 || selected) {
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
  }, [token, query, selected, clientMode]);


  async function register() {
    if (saving || !main || !token) {
      setError('Escolha o corretor responsável.');
      return;
    }
    if (clientMode === 'existing' && !selected) {
      setError('Selecione um cliente cadastrado ou escolha Novo cliente.');
      return;
    }
    if (clientMode === 'new') {
      const digits = phoneDigits(newPhone);
      if (!newName.trim() || newName.trim().length > 160) {
        setError('Informe o nome do cliente, com até 160 caracteres.');
        return;
      }
      if (![10, 11].includes(digits.length)) {
        setError('Informe um telefone com DDD válido.');
        return;
      }
      if (!originId) {
        setError('Selecione a origem do lead.');
        return;
      }
    }
    if (bonificacaoReg && clientMode === 'new') {
      if (!indicator) { setError('Escolha quem indicou para registrar a bonificação.');return; }
      const amount = bonificacaoValor.trim().replace(/\./g,'').replace(',','.');
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !(Number(amount)>0)) {
        setError('Informe o valor da bonificação. Exemplo: 30,00.');return;
      }
    }
    if (second === main) {
      setError('O segundo corretor deve ser diferente do primeiro.');
      return;
    }
    const owner = options?.minha_pessoa_id ?? ownerId ?? main;
    setSaving(true);
    setError('');
    Keyboard.dismiss();
    try {
      if (clientMode === 'existing') {
        const preview = await apiRequest<{
          retomavel: boolean;
          visita_id?: number;
          atendente_pessoa_id?: number | null;
          atendente_nome?: string | null;
        }>('mobile/cliente-visita-retomavel?cliente_id=' + selected!.id, { token });
        if (preview.retomavel && preview.visita_id) {
          setResumeCandidate({
            id: preview.visita_id,
            attendantId: preview.atendente_pessoa_id ?? null,
            attendantName: preview.atendente_nome ?? null,
          });
          return;
        }
      }
      const clientData = clientMode === 'existing'
        ? { cliente_id: selected!.id }
        : { novo_cliente: {
            nome: newName.trim(), telefone: phoneDigits(newPhone),
            cpf: newCpf.replace(/\D/g, ''), email: newEmail.trim(),
            origem_id: originId, indicador_cliente_id: indicator?.id ?? null,
            dono_corrente_pessoa_id: owner,
            bonificacao_registrar: bonificacaoReg && !!indicator,
            bonificacao_valor: bonificacaoReg ? bonificacaoValor.trim().replace(/\./g,'').replace(',','.') : null,
            bonificacao_paga: bonificacaoReg && bonificacaoPaga && admin,
          } };
      const result = await apiRequest<{ message: string; visita_id: number; retomada?: boolean; cliente_cadastrado?: boolean }>(
        'mobile/atendimentos/chegada', {
          method: 'POST', token,
          body: {
            ...clientData, corretor_pessoa_id: main,
            segundo_corretor_pessoa_id: second,
          },
        },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRegisteredVisit({
        id: result.visita_id,
        title: result.retomada ? 'Visita retomada!' : 'Chegada registrada!',
        description: clientMode === 'new'
          ? newName.trim() + ' foi cadastrado e a chegada registrada com sucesso.'
          : (result.retomada
            ? 'A visita de hoje foi reaberta, sem duplicar o atendimento.'
            : 'O cliente já está na lista de atendimentos, com o horário registrado.'),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a chegada.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function resumeFromArrival(mode: 'mesmo', _newId: null) {
    if (!token || !resumeCandidate) throw new Error('Escolha uma visita para retomar.');
    const result = await apiRequest<{ message: string }>(
      'mobile/atendimentos/' + resumeCandidate.id + '/retomar', {
        method: 'POST',
        token,
        body: {
          modo_atendente: mode,
          corretor_pessoa_id: main,
          segundo_corretor_pessoa_id: second,
        },
      },
    );
    const resumedId = resumeCandidate.id;
    setResumeCandidate(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Evita dois modais simultâneos no Android.
    setTimeout(() => setRegisteredVisit({
      id: resumedId,
      title: 'Atendimento retomado!',
      description: result.message,
    }), 360);
  }

  const brokers = (options?.corretores ?? []).map(p => ({ id: p.id, label: p.nome }));
  const mainName = options?.corretores.find(p => p.id === main)?.nome;
  const secondName = options?.corretores.find(p => p.id === second)?.nome;
  const origin = options?.origens.find(o => o.id === originId);
  const effectiveOwner = options?.minha_pessoa_id ?? ownerId ?? main;
  const ownerName = options?.atendentes.find(p => p.id === effectiveOwner)?.nome ?? '';
  const isNew = clientMode === 'new';

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
          <Text style={styles.heroSub}>Encontre o cliente ou faça um cadastro rápido, sem sair da chegada.</Text>
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
          <View style={styles.modeSwitch}>
            <Pressable accessibilityRole="button" onPress={() => { setClientMode('existing'); setError(''); }}
              style={[styles.modeItem, !isNew && styles.modeActive]}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search' }} size={17}
                tintColor={!isNew ? colors.brandDark : colors.muted} />
              <Text style={[styles.modeText, !isNew && styles.modeTextActive]}>Já cadastrado</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setClientMode('new'); setError(''); setSelected(null); }}
              style={[styles.modeItem, isNew && styles.modeActive]}>
              <SymbolView name={{ ios: 'person.badge.plus', android: 'person_add' }} size={17}
                tintColor={isNew ? colors.brandDark : colors.muted} />
              <Text style={[styles.modeText, isNew && styles.modeTextActive]}>Novo cliente</Text>
            </Pressable>
          </View>
          {!isNew && (selected ? <View style={styles.selectedClient}>
            <View style={styles.clientAvatar}><Text style={styles.avatarText}>{selected.nome.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.clientInfo}><Text style={styles.clientName}>{selected.nome}</Text><Text style={styles.clientSub}>{selected.telefone ? maskPhoneBR(selected.telefone) : 'Sem telefone informado'}</Text></View>
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
              <View style={styles.clientInfo}><Text style={styles.clientName}>{client.nome}</Text><Text style={styles.clientSub}>{client.telefone ? maskPhoneBR(client.telefone) : 'Sem telefone'}</Text></View>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={20} tintColor={colors.muted} />
            </Pressable>)}
          </>)}
          {isNew && <View style={styles.newFields}>
            <Text style={styles.fieldLabel}>Nome completo *</Text>
            <TextInput style={styles.newInput} value={newName} onChangeText={setNewName}
              placeholder="Nome do cliente" placeholderTextColor="#A09BB4"
              autoCapitalize="words" maxLength={160} accessibilityLabel="Nome completo do novo cliente" />
            <Text style={[styles.fieldLabel, styles.fieldSpace]}>WhatsApp / telefone com DDD *</Text>
            <TextInput style={styles.newInput} value={newPhone}
              onChangeText={value => setNewPhone(previous => editMaskedPhoneBR(previous, value))}
              placeholder="(21) 99999-9999" placeholderTextColor="#A09BB4"
              keyboardType="phone-pad" maxLength={20} accessibilityLabel="Telefone do novo cliente"
              textContentType="telephoneNumber" />
            <Text style={[styles.fieldLabel, styles.fieldSpace]}>Origem do lead *</Text>
            <Pressable onPress={() => { Keyboard.dismiss(); setSheet('origin'); }}
              style={styles.selectBox} accessibilityRole="button">
              <Text style={[styles.selectValue, !origin && styles.placeholder]}>{origin?.nome || 'Selecionar origem'}</Text>
              <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={18} tintColor={colors.brandDark} />
            </Pressable>
            {origin?.permite_indicador && <View style={styles.fieldSpace}>
              <Text style={styles.fieldLabel}>Quem indicou? (opcional)</Text>
              <Pressable style={[styles.selectBox,indicator && styles.indicatorBox]}
                accessibilityRole="button" onPress={() => { Keyboard.dismiss();setIndicatorPickerOpen(true); }}>
                <View style={styles.clientInfo}>
                  <Text style={[styles.selectValue,!indicator && styles.placeholder]}>
                    {indicator?.nome || 'Localizar cliente indicador'}
                  </Text>
                  {!!indicator&&<Text style={styles.clientSub}>Corrente herdada de quem indicou</Text>}
                </View>
                <SymbolView name={{ios:'magnifyingglass',android:'search'}} size={19} tintColor={colors.brandDark}/>
              </Pressable>
              {indicator&&<View style={styles.bonusCard}>
                <Text style={styles.bonusQuestion}>O indicador recebeu bonificação?</Text>
                <Text style={styles.bonusHelp}>O valor será atribuído à conta do titular da corrente.</Text>
                <View style={styles.bonusRow}>
                  <Pressable onPress={() => {setBonificacaoReg(false);setBonificacaoPaga(false);}}
                    style={[styles.bonusOption,!bonificacaoReg&&styles.bonusActive]}>
                    <Text style={[styles.bonusChoice,!bonificacaoReg&&styles.bonusChoiceActive]}>Não</Text>
                  </Pressable>
                  <Pressable onPress={() => setBonificacaoReg(true)}
                    style={[styles.bonusOption,bonificacaoReg&&styles.bonusActive]}>
                    <Text style={[styles.bonusChoice,bonificacaoReg&&styles.bonusChoiceActive]}>Sim</Text>
                  </Pressable>
                </View>
                {bonificacaoReg&&<>
                  <Text style={[styles.fieldLabel,{marginTop:12}]}>Valor da bonificação (R$)</Text>
                  <TextInput style={styles.newInput} placeholder="30,00"
                    keyboardType="decimal-pad" value={bonificacaoValor} onChangeText={setBonificacaoValor}/>
                  <Text style={styles.bonusHelp}>O lançamento começa pendente, sem afetar o financeiro até a confirmação.</Text>
                  {admin&&<Pressable style={styles.bonusPaid} onPress={()=>setBonificacaoPaga(!bonificacaoPaga)}>
                    <SymbolView name={{ios:bonificacaoPaga?'checkmark.circle.fill':'circle',android:bonificacaoPaga?'check_circle':'radio_button_unchecked'}}
                      size={21} tintColor={colors.brandDark}/>
                    <Text style={styles.bonusPaidText}>Pagamento já realizado — lançar despesa agora</Text>
                  </Pressable>}
                </>}
              </View>}
            </View>}
            {!indicator && <View style={styles.fieldSpace}>
              <Text style={styles.fieldLabel}>Dono da corrente *</Text>
              {options?.minha_pessoa_id != null ? <View style={styles.ownerFixed}>
                <SymbolView name={{ ios: 'person.crop.circle', android: 'account_circle' }} size={19} tintColor={colors.brandDark} />
                <Text style={styles.ownerText}>{ownerName || 'Sua corrente'}</Text>
              </View> : <Pressable style={styles.selectBox} onPress={() => { Keyboard.dismiss(); setSheet('owner'); }}
                accessibilityRole="button">
                <Text style={[styles.selectValue, !ownerName && styles.placeholder]}>{ownerName || 'Selecionar responsável'}</Text>
                <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={18} tintColor={colors.brandDark} />
              </Pressable>}
            </View>}
            <Pressable onPress={() => setExtraFields(!extraFields)} style={styles.moreButton} accessibilityRole="button">
              <SymbolView name={{ ios: extraFields ? 'minus.circle' : 'plus.circle', android: extraFields ? 'remove_circle_outline' : 'add_circle_outline' }}
                size={17} tintColor={colors.brandDark} />
              <Text style={styles.moreText}>{extraFields ? 'Ocultar dados opcionais' : 'Adicionar CPF e e-mail (opcional)'}</Text>
            </Pressable>
            {extraFields && <View>
              <Text style={styles.fieldLabel}>CPF (opcional)</Text>
              <TextInput style={styles.newInput} keyboardType="numeric" value={newCpf}
                onChangeText={setNewCpf} maxLength={14} placeholder="Somente números" placeholderTextColor="#A09BB4" />
              <Text style={[styles.fieldLabel, styles.fieldSpace]}>E-mail (opcional)</Text>
              <TextInput style={styles.newInput} keyboardType="email-address" autoCapitalize="none" value={newEmail}
                onChangeText={setNewEmail} maxLength={254} placeholder="cliente@exemplo.com" placeholderTextColor="#A09BB4" />
            </View>}
            <Text style={styles.hint}>O cadastro e a chegada são gravados juntos. Se houver erro, nenhum dos dois será confirmado.</Text>
          </View>}
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

        <Pressable style={[styles.primary, (saving || loading || !main || (!isNew && !selected)) && styles.disabled]}
          disabled={saving || loading || !main || (!isNew && !selected)} onPress={() => { void register(); }}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <>
            <Text style={styles.primaryText}>Confirmar chegada</Text>
            <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={19} tintColor="#FFFFFF" />
          </>}
        </Pressable>
        <Text style={styles.note}>O horário e as permissões são confirmados no servidor. O cliente novo fica disponível também no Splash web.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    <ChoiceSheet open={sheet !== null}
      title={sheet === 'main' ? 'Corretor responsável' : sheet === 'second' ? 'Segundo corretor'
        : sheet === 'origin' ? 'Origem do lead' : 'Dono da corrente'}
      choices={sheet === 'origin'
        ? (options?.origens || []).map(o => ({ id: o.id, label: o.nome }))
        : sheet === 'owner'
          ? (options?.atendentes || []).map(o => ({ id: o.id, label: o.nome }))
          : brokers}
      selected={sheet === 'main' ? main : sheet === 'second' ? second
        : sheet === 'origin' ? originId : ownerId}
      allowEmpty={sheet === 'second'}
      onClose={() => setSheet(null)} onChoose={value => {
        if (sheet === 'main') {
          if (ownerId === null || ownerId === main) setOwnerId(value);
          setMain(value);
        }
        if (sheet === 'second') setSecond(value);
        if (sheet === 'owner') setOwnerId(value);
        if (sheet === 'origin') {
          setOriginId(value);
          setIndicator(null);setBonificacaoReg(false);setBonificacaoPaga(false);setBonificacaoValor('');
        }
      }} />
    <ClientPickerModal visible={indicatorPickerOpen} token={token} title="Selecionar quem indicou"
      onClose={() => setIndicatorPickerOpen(false)}
      onChoose={client => {
        setIndicator(client);
        if (!client) { setBonificacaoReg(false);setBonificacaoPaga(false);setBonificacaoValor(''); }
      }} />
    <ResumeAttendantModal visible={resumeCandidate !== null}
      attendantId={resumeCandidate?.attendantId ?? null}
      attendantName={resumeCandidate?.attendantName ?? null}
      attendants={options?.atendentes ?? []}
      onClose={() => setResumeCandidate(null)}
      onConfirm={resumeFromArrival} />
    <ActionModal visible={registeredVisit !== null} variant="success"
      title={registeredVisit?.title || 'Chegada registrada!'}
      description={registeredVisit?.description || ''}
      primaryLabel="Abrir atendimento" secondaryLabel="Voltar para atendimentos"
      onPrimary={() => {
        const id = registeredVisit?.id;
        if (!id) return;
        setRegisteredVisit(null);
        router.replace({ pathname: '/atendimento/[id]', params: { id: String(id) } });
      }}
      onSecondary={() => { setRegisteredVisit(null); router.back(); }} />
  </SafeAreaView>;
}

const lightStyles = StyleSheet.create({
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
  fieldSpace: { marginTop: 16 },
  indicatorBox: { backgroundColor:'#F5F1FF',borderColor:'#D5C6FF' },
  bonusCard: { marginTop:14,backgroundColor:'#F9F7FF',borderRadius:16,padding:14,borderWidth:1,borderColor:'#E3DAFF' },
  bonusQuestion: { fontWeight:'900',fontSize:13,color:colors.ink },
  bonusHelp: { color:colors.muted,fontSize:11,lineHeight:17,marginTop:6 },
  bonusRow: { flexDirection:'row',gap:9,marginTop:12 },
  bonusOption: { flex:1,minHeight:39,borderRadius:11,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line,justifyContent:'center',alignItems:'center' },
  bonusActive: { backgroundColor:colors.brand,borderColor:colors.brand },
  bonusChoice: { color:colors.brandDark,fontSize:12,fontWeight:'800' },
  bonusChoiceActive: { color:'#FFFFFF' },
  bonusPaid: { minHeight:49,marginTop:12,flexDirection:'row',alignItems:'center',gap:10 },
  bonusPaidText: { flex:1,fontSize:11,color:colors.ink,fontWeight:'700',lineHeight:17 },
  newFields: { marginTop: 6 },
  newInput: { height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 15, paddingHorizontal: 15,
    color: colors.ink, fontSize: 14, backgroundColor: '#FAF9FF' },
  modeSwitch: { flexDirection: 'row', gap: 5, backgroundColor: colors.background, borderRadius: 15, padding: 5, marginBottom: 20 },
  modeItem: { flex: 1, minHeight: 45, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  modeActive: { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#1B2540', shadowOpacity: .06, shadowRadius: 5 },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: colors.brandDark },
  ownerFixed: { minHeight: 52, backgroundColor: colors.pale, borderRadius: 14, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  ownerText: { color: colors.brandDark, fontSize: 13, fontWeight: '800', flex: 1 },
  moreButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 46, marginTop: 9 },
  moreText: { color: colors.brandDark, fontSize: 12, fontWeight: '700' },
  selectBox: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FAF9FF' },
  selectValue: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700' },
  placeholder: { color: colors.muted, fontWeight: '500' },
  primary: { marginTop: 23, minHeight: 56, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 17 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 16, paddingHorizontal: 15 },
});
