import FeedbackPopup from '../../src/components/FeedbackPopup';
import {useTheme,useThemedStyles} from '../../src/ThemeContext';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import {
  apiRequest, displayDate, displayTime, MobileVisitOptions, VisitDetailsResponse,
} from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import ChoiceSheet, { Choice } from '../../src/components/ChoiceSheet';
import ActionModal from '../../src/components/ActionModal';
import ToastNotice from '../../src/components/ToastNotice';
import ResumeAttendantModal from '../../src/components/ResumeAttendantModal';
import { colors, shadows } from '../../src/theme';

const statusNames: Record<string, string> = {
  AGUARDANDO: 'Aguardando', ATENDENDO: 'Em atendimento', RETORNO: 'Retorno agendado',
  SEM_VENDA: 'Não fechou', PENDENCIA: 'Em negociação', VENDA: 'Venda fechada',
  CANCELADA: 'Cancelada',
};
const outcomes = [
  { value: 'RETORNO', label: 'Agendar retorno', icon: 'event' },
  { value: 'PENDENCIA', label: 'Negociação', icon: 'pending_actions' },
  { value: 'SEM_VENDA', label: 'Não fechou', icon: 'cancel' },
  { value: 'VENDA', label: 'Venda fechada', icon: 'check_circle' },
] as const;

type FormMode = 'start' | 'finish' | null;
type SheetField = 'main' | 'secondary' | 'reason' | null;

function formatDatetime(value: string | null | undefined): string {
  return value ? displayDate(value) + ' às ' + displayTime(value) : '—';
}

function parseReturnDate(input: string): string | null {
  const text = input.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso = br ? br[3] + '-' + br[2] + '-' + br[1] : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day ? iso : null;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const styles=useThemedStyles(lightStyles);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text>
    </View>
  );
}

function PickerField({ label, value, hint, onPress }: {
  label: string; value?: string; hint: string; onPress: () => void;
}) {
  const styles=useThemedStyles(lightStyles);
  return <View style={styles.formField}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.picker}>
      <Text style={[styles.pickerValue, !value && styles.placeholder]} numberOfLines={1}>{value || hint}</Text>
      <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={19} tintColor={colors.brandDark} />
    </Pressable>
  </View>;
}

export default function AtendimentoDetailScreen() {
  const {palette}=useTheme();
  const styles=useThemedStyles(lightStyles);
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const { token,user } = useAuth();
  const [data, setData] = useState<VisitDetailsResponse | null>(null);
  const [options, setOptions] = useState<MobileVisitOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [success, setSuccess] = useState<{ title: string; description: string; completeClientId?: number; saleVisitId?: number; pendingVisitId?:number } | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [sheet, setSheet] = useState<SheetField>(null);
  const [mainAttendant, setMainAttendant] = useState<number | null>(null);
  const [secondAttendant, setSecondAttendant] = useState<number | null>(null);
  const [outcome, setOutcome] = useState('RETORNO');
  const [reason, setReason] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!token || !Number.isSafeInteger(id) || id < 1) {
      setError('Atendimento inválido.');
      setLoading(false);
      return;
    }
    try {
      const response = await Promise.all([
        apiRequest<VisitDetailsResponse>('mobile/atendimentos/' + id, { token }),
        apiRequest<MobileVisitOptions>('mobile/atendimento-opcoes', { token }),
      ]);
      setData(response[0]);
      setOptions(response[1]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o atendimento.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (data && mode === null) {
      setMainAttendant(data.visita.atendente_pessoa_id);
      setSecondAttendant(data.visita.atendente_adicional_pessoa_id);
    }
  }, [data, mode]);

  const visit = data?.visita;
  const canManageSales=['admin','gerente','corretor'].includes(user?.role||'');
  const isToday = visit?.chegada_em?.slice(0, 10) === (() => {
    const d = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  })();
  const canResume = isToday && ['RETORNO', 'SEM_VENDA', 'PENDENCIA'].includes(visit?.status || '')
    && !visit?.operacao_situacao;

  function selectMode(value: FormMode) {
    setMode(value);
    setError('');
    setSuccess(null);
    setOutcome('RETORNO');
    setReason(null);
    setReturnDate('');
    setNotes('');
    setMainAttendant(visit?.atendente_pessoa_id ?? null);
    setSecondAttendant(visit?.atendente_adicional_pessoa_id ?? null);
    Haptics.selectionAsync().catch(() => {});
  }

  async function applyAction(action: 'start' | 'finish') {
    if (saving || !token) return;
    const payload = action === 'start'
      ? { atendente_pessoa_id: mainAttendant, atendente_adicional_pessoa_id: secondAttendant }
      : { status: outcome, motivo_nao_venda_id: outcome === 'SEM_VENDA' ? reason : null,
          retorno_previsto: outcome === 'RETORNO' ? parseReturnDate(returnDate) : null,
          observacoes: notes.trim() };
    if (action === 'start' && !mainAttendant) { setError('Selecione o atendente responsável.'); return; }
    if (action === 'start' && mainAttendant === secondAttendant) { setError('Selecione atendentes diferentes.'); return; }
    if (action === 'finish' && outcome === 'RETORNO' && !parseReturnDate(returnDate)) {
      setError('Informe uma data válida, como 15/11/2026.'); return;
    }
    if (action === 'finish' && outcome === 'SEM_VENDA' && !reason) {
      setError('Selecione o motivo de não fechamento.'); return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<{ message: string }>('mobile/atendimentos/' + id + '/' +
        ({ start: 'iniciar', finish: 'finalizar' }[action]), {
        method: 'POST', token, body: payload,
      });
      setMode(null);
      await load();
      const incomplete = action === 'finish' && outcome === 'VENDA'
        && !!visit && (!visit.cliente_cpf || !visit.cliente_email || !visit.cliente_nascimento);
      setSuccess({
        title: action === 'start' ? 'Atendimento iniciado!' : 'Resultado registrado!',
        description: incomplete
          ? result.message + ' Quer aproveitar e completar o cadastro do cliente?'
          : result.message,
        completeClientId: incomplete ? visit?.cliente_id : undefined,
        saleVisitId: action === 'finish' && outcome === 'VENDA' && canManageSales ? id : undefined,
        pendingVisitId: action === 'finish' && outcome === 'PENDENCIA' && canManageSales ? id : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  function confirmFinish() {
    if (outcome === 'RETORNO' && !parseReturnDate(returnDate)) {
      setError('Informe uma data de retorno válida, no formato DD/MM/AAAA.');
      return;
    }
    if (outcome === 'SEM_VENDA' && !reason) {
      setError('Selecione o motivo de não fechamento.');
      return;
    }
    setError('');
    setConfirming(true);
  }

  function confirmResume() {
    setError('');
    setResumeOpen(true);
  }

  function submitConfirmed() {
    setConfirming(false);
    void applyAction('finish');
  }

  async function resumeWithAttendant(mode: 'mesmo', _newId: null) {
    if (!token) throw new Error('Sessão inválida. Entre novamente.');
    const response = await apiRequest<{ message: string }>('mobile/atendimentos/' + id + '/retomar', {
      method: 'POST',
      token,
      body: {
        modo_atendente: mode,
      },
    });
    setResumeOpen(false);
    await load();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Android precisa encerrar o primeiro modal antes de abrir o de sucesso.
    setTimeout(() => setSuccess({
      title: 'Atendimento retomado!',
      description: response.message,
    }), 360);
  }

  async function openWhatsApp() {
    const digits = String(visit?.cliente_telefone || '').replace(/\D/g, '');
    if (digits.length < 10) return;
    const phone = digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits;
    try { await Linking.openURL('https://wa.me/' + phone); }
    catch { setError('Não foi possível abrir o WhatsApp.'); }
  }

  const choices: Choice[] = sheet === 'reason'
    ? (options?.motivos || []).map(v => ({ id: v.id, label: v.descricao }))
    : (options?.atendentes || []).map(v => ({ id: v.id, label: v.nome }));
  const selected = sheet === 'main' ? mainAttendant : sheet === 'secondary' ? secondAttendant : reason;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Voltar" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
              <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back' }} size={20} tintColor={palette.ink} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>OPERAÇÃO / VISITAS</Text>
              <Text style={styles.headerTitle}>Detalhes do atendimento</Text>
            </View>
          </View>

          {loading && !visit ? <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 65 }} /> : null}
          {!!error && <View style={styles.feedback}>
            <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error_outline' }} size={19} tintColor="#A75D39" />
            <Text style={styles.feedbackText}>{error}</Text>
            <Pressable onPress={() => setError('')} accessibilityLabel="Fechar aviso">
              <SymbolView name={{ ios: 'xmark', android: 'close' }} size={17} tintColor="#A75D39" />
            </Pressable>
          </View>}
           {visit && <View>
            <View style={styles.hero}>
              <View style={styles.heroOrbit} />
              <Text style={styles.heroEyebrow}>ATENDIMENTO Nº {visit.id}</Text>
              <Text style={styles.heroName}>{visit.cliente_nome}</Text>
              <View style={styles.heroStatus}><View style={styles.heroDot} /><Text style={styles.heroStatusText}>{statusNames[visit.status] ?? visit.status}</Text></View>
              <Text style={styles.heroSub}>Chegada registrada em {formatDatetime(visit.chegada_em)}</Text>
            </View>

            <View style={styles.quickActions}>
              {String(visit.cliente_telefone || '').replace(/\D/g, '').length >= 10
                ? <Pressable onPress={() => { void openWhatsApp(); }} style={styles.quickButton}>
                    <SymbolView name={{ ios: 'bubble.left.and.bubble.right', android: 'chat' }} size={18} tintColor={colors.brandDark} />
                    <Text style={styles.quickText}>WhatsApp</Text>
                  </Pressable>
                : null}
              <Pressable onPress={() => { setRefreshing(true); void load(); }} style={styles.quickButton}>
                <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh' }} size={18} tintColor={colors.brandDark} />
                <Text style={styles.quickText}>Atualizar</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informações da visita</Text>
              <DetailRow label="Corretor" value={visit.corretor_nome} />
              <DetailRow label="Segundo corretor" value={visit.segundo_corretor_nome} />
              <DetailRow label="Atendente" value={visit.atendente_nome} />
              <DetailRow label="Atendente adicional" value={visit.adicional_nome} />
              <DetailRow label="Início" value={formatDatetime(visit.inicio_em)} />
              <DetailRow label="Encerramento" value={formatDatetime(visit.fim_em)} />
              {visit.retorno_previsto ? <DetailRow label="Retorno previsto" value={displayDate(visit.retorno_previsto)} /> : null}
              {visit.motivo_nome ? <DetailRow label="Motivo" value={visit.motivo_nome} /> : null}
              {visit.observacoes ? <View style={styles.notes}>
                  <Text style={styles.detailLabel}>Observações</Text>
                  <Text style={styles.notesValue}>{visit.observacoes}</Text>
                </View> : null}
            </View>

            {mode === null && <View style={styles.section}>
              <Text style={styles.sectionTitle}>Próxima ação</Text>
              {visit.status === 'AGUARDANDO' && <Pressable style={styles.primaryAction} onPress={() => selectMode('start')}>
                <Text style={styles.primaryText}>Iniciar atendimento</Text>
                <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={19} tintColor="#FFFFFF" />
              </Pressable>}
              {visit.status === 'ATENDENDO' && <Pressable style={styles.primaryAction} onPress={() => selectMode('finish')}>
                <Text style={styles.primaryText}>Finalizar e registrar resultado</Text>
                <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={19} tintColor="#FFFFFF" />
              </Pressable>}
              {visit.status === 'VENDA' && <Pressable style={styles.primaryAction}
                onPress={() => router.push({pathname:'/venda/[id]',
                  params:visit.operacao_id?{id:String(visit.operacao_id)}:{id:'novo',visita:String(visit.id)}})}>
                <Text style={styles.primaryText}>{visit.operacao_id?'Ver venda e comissões':'Cadastrar venda e pagamentos'}</Text>
                <SymbolView name={{ios:'arrow.right',android:'arrow_forward'}} size={19} tintColor="#FFFFFF" />
              </Pressable>}
              {visit.status==='PENDENCIA'&&canManageSales&&<Pressable style={styles.primaryAction}
                onPress={()=>router.push(visit.operacao_id
                  ?{pathname:'/pendencia/[id]',params:{id:String(visit.operacao_id)}}
                  :{pathname:'/venda/[id]',params:{id:'novo',visita:String(visit.id)}})}>
                <Text style={styles.primaryText}>{visit.operacao_id
                  ?'Abrir negociação e fechar venda':'Cadastrar negociação pendente'}</Text>
                <SymbolView name={{ios:'arrow.right',android:'arrow_forward'}} size={19} tintColor="#FFFFFF"/>
              </Pressable>}
              {canResume && <Pressable style={styles.primaryAction} disabled={saving} onPress={confirmResume}>
                <Text style={styles.primaryText}>{saving ? 'Retomando...' : 'Retomar visita de hoje'}</Text>
                <SymbolView name={{ ios: 'arrow.counterclockwise', android: 'restart_alt' }} size={19} tintColor="#FFFFFF" />
              </Pressable>}
              {!['AGUARDANDO', 'ATENDENDO'].includes(visit.status) && !canResume
                && !(visit.status==='PENDENCIA'&&canManageSales)
                ? <Text style={styles.readOnly}>Este atendimento está encerrado. Seu histórico permanece disponível para consulta.</Text>
                : null}
            </View>}

            {mode === 'start' && <View style={styles.section}>
              <Text style={styles.sectionTitle}>Iniciar atendimento</Text>
              <Text style={styles.sectionSub}>O horário será registrado automaticamente pelo servidor.</Text>
              <PickerField label="Atendente responsável *"
                value={options?.atendentes.find(p => p.id === mainAttendant)?.nome}
                hint="Selecionar atendente" onPress={() => setSheet('main')} />
              <PickerField label="Atendente adicional"
                value={options?.atendentes.find(p => p.id === secondAttendant)?.nome}
                hint="Nenhum" onPress={() => setSheet('secondary')} />
              {visit.atendente_pessoa_id ? <Text style={styles.hint}>Nas visitas de retorno, mantenha o mesmo atendente principal.</Text> : null}
              <Pressable style={[styles.primaryAction, saving && styles.disabled]} disabled={saving} onPress={() => { void applyAction('start'); }}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Confirmar início</Text>}
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={() => selectMode(null)} disabled={saving}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
            </View>}

            {mode === 'finish' && <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resultado do atendimento</Text>
              <Text style={styles.sectionSub}>Escolha como essa visita terminou.</Text>
              <View style={styles.outcomeGrid}>
                {outcomes.map(item => <Pressable key={item.value} onPress={() => setOutcome(item.value)}
                  style={[styles.outcome, outcome === item.value && styles.outcomeActive]}>
                  <SymbolView name={{ ios: 'checkmark.circle', android: item.icon }} size={18}
                    tintColor={outcome === item.value ? colors.brandDark : colors.muted} />
                  <Text style={[styles.outcomeText, outcome === item.value && styles.outcomeTextActive]}>{item.label}</Text>
                </Pressable>)}
              </View>
              {outcome === 'RETORNO' && <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Data prevista de retorno *</Text>
                <TextInput style={styles.input} placeholder="DD/MM/AAAA" placeholderTextColor="#A6A0B4"
                  keyboardType="numbers-and-punctuation" value={returnDate} onChangeText={setReturnDate} maxLength={10} />
              </View>}
              {outcome === 'SEM_VENDA' && <PickerField label="Motivo de não fechamento *"
                value={options?.motivos.find(p => p.id === reason)?.descricao}
                hint="Selecionar motivo" onPress={() => setSheet('reason')} />}
              {outcome === 'VENDA' && <Text style={styles.saleNote}>
                Após finalizar, você poderá cadastrar o título e registrar os pagamentos. Se necessário, também poderá completar primeiro o cadastro do cliente.
              </Text>}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Observações</Text>
                <TextInput style={[styles.input, styles.multiline]} multiline
                  placeholder="Anotações sobre o resultado" placeholderTextColor="#A6A0B4"
                  textAlignVertical="top" maxLength={3000} value={notes} onChangeText={setNotes} />
              </View>
              <Pressable style={[styles.primaryAction, saving && styles.disabled]} disabled={saving} onPress={confirmFinish}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Registrar resultado</Text>}
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={() => selectMode(null)} disabled={saving}><Text style={styles.cancelText}>Voltar</Text></Pressable>
            </View>}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Linha do tempo</Text>
              {(data?.trocas_atendente || []).length > 0 && <View style={styles.changeHistory}>
                <Text style={styles.changeEyebrow}>TROCAS DE ATENDENTE</Text>
                {(data?.trocas_atendente || []).map((change, index) => <View key={index} style={styles.changeRow}>
                  <SymbolView name={{ ios: 'person.2.circle', android: 'supervisor_account' }}
                    size={19} tintColor={colors.brandDark} />
                  <View style={styles.changeText}>
                    <Text style={styles.changeTitle}>
                      {change.anterior_nome || 'Sem atendente'} → {change.novo_nome}
                    </Text>
                    <Text style={styles.changeDate}>{formatDatetime(change.criado_em)}</Text>
                  </View>
                </View>)}
              </View>}
              {(data?.historico || []).length ? data!.historico.map((event, index) =>
                <View key={String(index) + event.criado_em} style={styles.timelineRow}>
                  <View style={styles.timelineTrack}>
                    <View style={styles.timelineDot} />
                    {index < (data?.historico.length ?? 0) - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.timelineText}>
                    <Text style={styles.timelineTitle}>{statusNames[event.status_novo] || event.status_novo}</Text>
                    <Text style={styles.timelineDate}>{formatDatetime(event.criado_em)}</Text>
                  </View>
                </View>)
                : <Text style={styles.readOnly}>Nenhum evento encontrado.</Text>}
            </View>
          </View>}
        </ScrollView>
      </KeyboardAvoidingView>
      <ChoiceSheet open={sheet !== null}
        title={sheet === 'main' ? 'Atendente responsável' : sheet === 'secondary' ? 'Atendente adicional' : 'Motivo da não venda'}
        choices={choices} selected={selected} allowEmpty={sheet === 'secondary'}
        onClose={() => setSheet(null)}
        onChoose={value => {
          if (sheet === 'main') setMainAttendant(value);
          if (sheet === 'secondary') setSecondAttendant(value);
          if (sheet === 'reason') setReason(value);
        }}
      />
      <ResumeAttendantModal visible={resumeOpen}
        attendantId={visit?.atendente_pessoa_id ?? null}
        attendantName={visit?.atendente_nome ?? null}
        attendants={options?.atendentes ?? []}
        onClose={() => setResumeOpen(false)}
        onConfirm={resumeWithAttendant} />
      <ActionModal visible={confirming} variant="confirm"
        title={outcome === 'VENDA' ? 'Confirmar venda fechada?' : 'Finalizar atendimento?'}
        description={outcome === 'VENDA'
          ? 'O resultado será salvo. Em seguida, escolha cadastrar a venda ou completar primeiro o cliente. Nenhum pagamento será lançado sem confirmação.'
          : 'O resultado será salvo no histórico e o horário de encerramento será registrado pelo servidor.'}
        primaryLabel="Sim, finalizar"
        secondaryLabel="Voltar" onPrimary={submitConfirmed}
        onSecondary={() => setConfirming(false)} busy={saving} />

      <Modal visible={!!success?.saleVisitId||!!success?.pendingVisitId} transparent animationType="fade"
        onRequestClose={() => setSuccess(null)}>
        <View style={styles.saleOverlay}>
          <View style={styles.saleModal}>
            <Text style={styles.saleModalTag}>ATENDIMENTO CONCLUÍDO</Text>
            <Text style={styles.saleModalTitle}>{success?.pendingVisitId?'Negociação pendente!':'Venda fechada!'}</Text>
            <Text style={styles.saleModalDescription}>
              {success?.pendingVisitId
                ?'O atendimento foi registrado como pendência. Cadastre as condições da negociação agora ou depois.'
                :'O atendimento foi encerrado. Como deseja continuar?'}
            </Text>
            <Pressable style={styles.salePrimary} onPress={() => {
              const nextVisitId = success?.saleVisitId||success?.pendingVisitId;
              setSuccess(null);
              if (nextVisitId) router.push({pathname:'/venda/[id]',
                params:{id:'novo',visita:String(nextVisitId)}});
            }}>
              <Text style={styles.salePrimaryText}>{success?.pendingVisitId?'Cadastrar negociação agora':'Cadastrar a venda agora'}</Text>
            </Pressable>
            {!!success?.completeClientId && <Pressable style={styles.saleSecondary} onPress={() => {
              const clientId=success?.completeClientId;
              const saleVisitId=success?.saleVisitId;
              setSuccess(null);
              if (clientId&&saleVisitId) router.push({pathname:'/cliente/[id]',
                params:{id:String(clientId),vendaVisita:String(saleVisitId)}});
            }}>
              <Text style={styles.saleSecondaryText}>Completar o cliente e depois vender</Text>
            </Pressable>}
            <Pressable style={styles.saleLater} onPress={()=>setSuccess(null)}>
              <Text style={styles.saleLaterText}>Fazer isso depois</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <FeedbackPopup error={error}
        success={success&&!success.saleVisitId?success.title+' '+success.description:''}
        onDismiss={()=>{setError('');setSuccess(null);}}/>
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  saleOverlay: { flex:1,backgroundColor:'rgba(21,15,43,.65)',justifyContent:'center',padding:23 },
  saleModal: { backgroundColor:'#FFFFFF',borderRadius:24,padding:24,gap:13 },
  saleModalTag: { color:colors.brandDark,fontSize:10,fontWeight:'900',letterSpacing:1 },
  saleModalTitle: { color:colors.navy,fontSize:25,fontWeight:'900' },
  saleModalDescription: { color:colors.muted,fontSize:14,lineHeight:20,marginBottom:7 },
  salePrimary: {backgroundColor:colors.brand,padding:17,borderRadius:15,alignItems:'center'},
  salePrimaryText: {color:'#FFFFFF',fontSize:14,fontWeight:'900'},
  saleSecondary: {backgroundColor:'#F0EAFE',padding:16,borderRadius:15,alignItems:'center'},
  saleSecondaryText: {color:colors.brandDark,fontSize:13,fontWeight:'900',textAlign:'center'},
  saleLater: {padding:12,alignItems:'center'},
  saleLaterText: {color:colors.muted,fontSize:13,fontWeight:'800'},
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 38 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  back: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: colors.brandDark },
  headerTitle: { color: colors.ink, fontSize: 19, fontWeight: '800', marginTop: 4 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7F0', borderRadius: 17, padding: 14, marginBottom: 15, borderWidth: 1, borderColor: '#F7E6D4' },
  feedbackText: { flex: 1, color: '#92562F', lineHeight: 19, fontSize: 12 },
  success: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 17, marginBottom: 15, backgroundColor: '#EAF7F0' },
  successText: { flex: 1, color: '#32765D', lineHeight: 19, fontSize: 12, fontWeight: '700' },
  hero: { backgroundColor: colors.navy, borderRadius: 26, minHeight: 177, padding: 23, overflow: 'hidden' },
  heroOrbit: { width: 195, height: 195, backgroundColor: '#503987', borderRadius: 100, position: 'absolute', right: -75, top: -90, opacity: 0.5 },
  heroEyebrow: { color: '#D4C6FF', letterSpacing: 1.5, fontWeight: '800', fontSize: 10 },
  heroName: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 13, letterSpacing: -0.4 },
  heroStatus: { marginTop: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  heroDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: '#C8B9FF' },
  heroStatusText: { color: '#F1EDFF', fontWeight: '800', fontSize: 12 },
  heroSub: { color: '#D5CAE8', marginTop: 12, fontSize: 11.5 },
  quickActions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  quickButton: { flex: 1, minHeight: 42, borderRadius: 13, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  quickText: { color: colors.brandDark, fontWeight: '800', fontSize: 12 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 23, padding: 20, marginTop: 16, ...shadows.card },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 14 },
  sectionSub: { color: colors.muted, marginTop: -7, marginBottom: 12, lineHeight: 19, fontSize: 12 },
  detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailLabel: { flex: 1, color: colors.muted, fontSize: 12 },
  detailValue: { flex: 1.3, color: colors.ink, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  notes: { paddingTop: 13 },
  notesValue: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 8 },
  primaryAction: { marginTop: 10, minHeight: 54, borderRadius: 15, backgroundColor: colors.brand, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 15 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, textAlign: 'center' },
  disabled: { opacity: 0.6 },
  readOnly: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  formField: { marginTop: 15 },
  fieldLabel: { fontSize: 12, color: colors.ink, fontWeight: '800', marginBottom: 8 },
  picker: { minHeight: 53, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: '#F9F8FF', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  pickerValue: { flex: 1, color: colors.ink, fontWeight: '700', fontSize: 13 },
  placeholder: { color: colors.muted, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 15, minHeight: 53, paddingHorizontal: 15, color: colors.ink, fontSize: 14, backgroundColor: '#F9F8FF' },
  multiline: { minHeight: 93, paddingTop: 14, paddingBottom: 12 },
  hint: { color: colors.muted, marginTop: 10, fontSize: 11.5, lineHeight: 18 },
  cancelButton: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 20, minHeight: 38, justifyContent: 'center' },
  cancelText: { fontSize: 13, color: colors.brandDark, fontWeight: '800' },
  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  outcome: { width: '48%', borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFAFF', paddingVertical: 15, paddingHorizontal: 9, gap: 7 },
  outcomeActive: { backgroundColor: colors.pale, borderColor: '#B3A4FC' },
  outcomeText: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
  outcomeTextActive: { color: colors.brandDark },
  saleNote: { backgroundColor: '#F2EDFF', borderRadius: 13, padding: 12, color: '#5944A0', fontSize: 11.5, lineHeight: 19, marginTop: 14 },
  changeHistory: { backgroundColor: '#F8F6FF', borderRadius: 14, padding: 13, marginBottom: 18 },
  changeEyebrow: { color: colors.brandDark, fontWeight: '900', letterSpacing: 1.1, fontSize: 9.5, marginBottom: 8 },
  changeRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  changeText: { flex: 1 },
  changeTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  changeDate: { fontSize: 11, color: colors.muted, marginTop: 4 },
  timelineRow: { flexDirection: 'row', gap: 13, minHeight: 63 },
  timelineTrack: { width: 17, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.brand, backgroundColor: colors.pale, marginTop: 3 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#DDD6F8', marginTop: 3 },
  timelineText: { flex: 1, paddingBottom: 15 },
  timelineTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  timelineDate: { color: colors.muted, marginTop: 5, fontSize: 11 },
});
