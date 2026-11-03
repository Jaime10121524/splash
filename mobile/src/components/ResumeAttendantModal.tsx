import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { colors } from '../theme';
import type { MobilePersonOption } from '../api';

type ResumeChoice = 'mesmo' | 'outro';

export default function ResumeAttendantModal({
  visible, attendantId, attendantName, attendants, onClose, onConfirm,
}: {
  visible: boolean;
  attendantId: number | null;
  attendantName: string | null;
  attendants: MobilePersonOption[];
  onClose: () => void;
  onConfirm: (mode: ResumeChoice, newAttendantId: number | null) => Promise<void>;
}) {
  const [choice, setChoice] = useState<ResumeChoice | null>(null);
  const [newAttendant, setNewAttendant] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setChoice(null);
      setNewAttendant(null);
      setBusy(false);
      setError('');
    }
  }, [visible]);

  const available = attendants.filter(person => person.id !== attendantId);
  const hasPrevious = !!attendantId;
  const canSubmit = (choice === 'mesmo' && hasPrevious) || (choice === 'outro' && newAttendant !== null);

  async function confirm() {
    if (!choice || !canSubmit || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(choice, choice === 'outro' ? newAttendant : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível retomar a visita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent
      onRequestClose={() => { if (!busy) onClose(); }}>
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <Pressable style={styles.backdrop} accessibilityLabel="Cancelar retomada"
          onPress={() => { if (!busy) onClose(); }} />
        <View style={styles.modal}>
          <View style={styles.headerIcon}>
            <SymbolView name={{ ios: 'arrow.counterclockwise.circle.fill', android: 'restart_alt' }}
              size={29} tintColor={colors.brand} />
          </View>
          <Text style={styles.eyebrow}>RETOMADA DE VISITA</Text>
          <Text style={styles.title}>Quem vai atender agora?</Text>
          <Text style={styles.subtitle}>
            Escolha o mesmo responsável ou indique outro atendente. O novo período será registrado nesta visita.
          </Text>

          <Pressable style={[styles.option, choice === 'mesmo' && styles.selected, !hasPrevious && styles.unavailable]}
            onPress={() => { if (hasPrevious && !busy) { setChoice('mesmo'); setError(''); } }}
            disabled={!hasPrevious || busy} accessibilityRole="button">
            <View style={[styles.optionIcon, choice === 'mesmo' && styles.optionIconSelected]}>
              <SymbolView name={{ ios: 'person.crop.circle', android: 'account_circle' }}
                size={23} tintColor={colors.brandDark} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Mesmo atendente</Text>
              <Text style={styles.optionSub} numberOfLines={2}>
                {hasPrevious ? attendantName || 'Responsável atual' : 'Não há atendente anterior'}
              </Text>
            </View>
            <View style={[styles.radio, choice === 'mesmo' && styles.radioActive]}>
              {choice === 'mesmo' && <View style={styles.radioDot} />}
            </View>
          </Pressable>

          <Pressable style={[styles.option, choice === 'outro' && styles.selected]}
            onPress={() => { if (!busy) { setChoice('outro'); setError(''); } }}
            disabled={busy} accessibilityRole="button">
            <View style={[styles.optionIcon, choice === 'outro' && styles.optionIconSelected]}>
              <SymbolView name={{ ios: 'person.2.fill', android: 'supervisor_account' }}
                size={23} tintColor={colors.brandDark} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Outro atendente</Text>
              <Text style={styles.optionSub}>Selecionar quem assume o atendimento</Text>
            </View>
            <View style={[styles.radio, choice === 'outro' && styles.radioActive]}>
              {choice === 'outro' && <View style={styles.radioDot} />}
            </View>
          </Pressable>

          {choice === 'outro' && (
            <View style={styles.optionsArea}>
              <Text style={styles.optionsLabel}>SELECIONE O NOVO ATENDENTE</Text>
              <ScrollView style={styles.optionsList} nestedScrollEnabled
                contentContainerStyle={styles.optionsContent} keyboardShouldPersistTaps="handled">
                {available.length === 0
                  ? <Text style={styles.noAttendants}>Nenhum outro atendente ativo disponível.</Text>
                  : available.map(person => (
                    <Pressable key={person.id} style={[styles.person, newAttendant === person.id && styles.personSelected]}
                      disabled={busy} onPress={() => { setNewAttendant(person.id); setError(''); }}
                      accessibilityRole="button">
                      <Text numberOfLines={2} style={[styles.personText,
                        newAttendant === person.id && styles.personTextSelected]}>{person.nome}</Text>
                      {newAttendant === person.id
                        ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
                          size={20} tintColor={colors.brandDark} />
                        : <SymbolView name={{ ios: 'circle', android: 'radio_button_unchecked' }}
                          size={19} tintColor="#BDB4DB" />}
                    </Pressable>
                  ))}
              </ScrollView>
            </View>
          )}

          {!!error && (
            <View style={styles.error}>
              <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error_outline' }} size={17} tintColor="#AA6038" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable accessibilityRole="button" disabled={!canSubmit || busy}
            onPress={() => { void confirm(); }} style={[styles.primary, (!canSubmit || busy) && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <>
              <Text style={styles.primaryText}>Retomar atendimento</Text>
              <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={18} tintColor="#FFFFFF" />
            </>}
          </Pressable>
          <Pressable onPress={onClose} disabled={busy} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Agora não</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 19 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(24,15,51,0.65)' },
  modal: { width: '100%', maxWidth: 410, backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 20, paddingTop: 23, paddingBottom: 12,
    alignItems: 'stretch', elevation: 16, shadowColor: colors.navy, shadowOpacity: .15, shadowRadius: 28, shadowOffset: { width: 0, height: 12 },
    maxHeight: '94%' },
  headerIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.pale, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center' },
  eyebrow: { marginTop: 15, textAlign: 'center', color: colors.brandDark, fontSize: 9, letterSpacing: 1.5, fontWeight: '900' },
  title: { color: colors.ink, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 10, marginBottom: 18 },
  option: { minHeight: 72, padding: 12, borderRadius: 17, borderColor: colors.line, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9, backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: '#F7F4FF', borderColor: '#BDAFFC' },
  unavailable: { opacity: .48 },
  optionIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
  optionIconSelected: { backgroundColor: '#E7DFFF' },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 13, color: colors.ink, fontWeight: '800' },
  optionSub: { fontSize: 11, color: colors.muted, marginTop: 4, lineHeight: 15 },
  radio: { height: 19, width: 19, borderWidth: 2, borderColor: '#C7BEDB', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.brand },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  optionsArea: { marginTop: 4, marginBottom: 12 },
  optionsLabel: { fontSize: 10, fontWeight: '900', color: colors.brandDark, letterSpacing: .8, marginBottom: 9 },
  optionsList: { maxHeight: 180, flexGrow: 0 },
  optionsContent: { paddingBottom: 3 },
  person: { minHeight: 43, borderWidth: 1, borderColor: colors.line, borderRadius: 11, marginBottom: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, gap: 9 },
  personSelected: { backgroundColor: colors.pale, borderColor: '#BAAAFD' },
  personText: { color: colors.ink, fontSize: 12, fontWeight: '700', flex: 1 },
  personTextSelected: { color: colors.brandDark },
  noAttendants: { fontSize: 12, color: colors.muted, lineHeight: 19, padding: 12, textAlign: 'center' },
  error: { backgroundColor: '#FFF6ED', padding: 12, borderRadius: 12, flexDirection: 'row', gap: 7, marginBottom: 9, alignItems: 'center' },
  errorText: { flex: 1, color: '#985A35', fontSize: 11, lineHeight: 17 },
  primary: { backgroundColor: colors.brand, height: 53, borderRadius: 15, paddingHorizontal: 14, gap: 9,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 5 },
  disabled: { opacity: .5 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cancel: { minHeight: 41, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  cancelText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
});
