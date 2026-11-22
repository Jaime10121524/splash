import {useThemedStyles} from '../ThemeContext';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { colors } from '../theme';
import type { MobilePersonOption } from '../api';

/**
 * Retomada simples e segura: o atendente é herdado da própria visita.
 * O usuário confirma, mas não escolhe ou altera o responsável.
 */
export default function ResumeAttendantModal({
  visible, attendantId, attendantName, onClose, onConfirm,
}: {
  visible: boolean;
  attendantId: number | null;
  attendantName: string | null;
  attendants: MobilePersonOption[]; // compatibilidade com as telas existentes
  onClose: () => void;
  onConfirm: (mode: 'mesmo', newAttendantId: null) => Promise<void>;
}) {
  const styles=useThemedStyles(lightStyles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setBusy(false); setError(''); }
  }, [visible]);

  const hasPrevious = attendantId !== null && attendantId > 0;

  async function confirm() {
    if (!hasPrevious || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm('mesmo', null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível retomar a visita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent
      onRequestClose={() => { if (!busy) onClose(); }}>
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <Pressable style={styles.backdrop} accessibilityLabel="Cancelar retomada"
          onPress={() => { if (!busy) onClose(); }} />
        <View style={styles.modal}>
          <View style={styles.topLine} />
          <View style={styles.headerIcon}>
            <SymbolView name={{ ios: 'arrow.counterclockwise.circle.fill', android: 'restart_alt' }}
              size={30} tintColor={colors.brand} />
          </View>
          <Text style={styles.eyebrow}>RETOMADA DE VISITA</Text>
          <Text style={styles.title}>Retomar com o mesmo atendente?</Text>
          <Text style={styles.subtitle}>
            O atendimento será retomado com o responsável anterior, sem precisar selecioná-lo novamente.
          </Text>

          <View style={styles.attendant}>
            <View style={styles.avatar}>
              <SymbolView name={{ ios: 'person.crop.circle.fill', android: 'account_circle' }}
                size={28} tintColor={colors.brandDark} />
            </View>
            <View style={styles.attendantInfo}>
              <Text style={styles.attendantCaption}>ATENDENTE RESPONSÁVEL</Text>
              <Text style={styles.attendantName}>
                {attendantName || (hasPrevious ? 'Mesmo atendente da visita' : 'Não identificado')}
              </Text>
            </View>
            {hasPrevious && <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
              size={22} tintColor={colors.brand} />}
          </View>

          {!hasPrevious && <View style={styles.error}>
            <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error_outline' }}
              size={19} tintColor="#A75D39" />
            <Text style={styles.errorText}>
              Esta visita não possui atendente anterior. É necessário regularizar o cadastro antes de retomar.
            </Text>
          </View>}
          {!!error && <View style={styles.error}>
            <SymbolView name={{ ios: 'exclamationmark.circle', android: 'error_outline' }}
              size={19} tintColor="#A75D39" />
            <Text style={styles.errorText}>{error}</Text>
          </View>}

          <Pressable accessibilityRole="button" disabled={!hasPrevious || busy}
            onPress={() => { void confirm(); }}
            style={({ pressed }) => [styles.primary, (!hasPrevious || busy) && styles.disabled, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <>
              <Text style={styles.primaryText}>Sim, retomar atendimento</Text>
              <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }}
                size={18} tintColor="#FFFFFF" />
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

const lightStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(24,15,51,0.65)' },
  modal: { width: '100%', maxWidth: 410, backgroundColor: '#FFFFFF', borderRadius: 28,
    paddingHorizontal: 22, paddingTop: 25, paddingBottom: 14, overflow: 'hidden',
    elevation: 16, shadowColor: colors.navy, shadowOpacity: 0.15, shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 }, alignItems: 'stretch' },
  topLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: colors.brand },
  headerIcon: { width: 62, height: 62, borderRadius: 21, backgroundColor: colors.pale,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { marginTop: 17, textAlign: 'center', color: colors.brandDark, fontSize: 10,
    letterSpacing: 1.5, fontWeight: '900' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 8, lineHeight: 28 },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 20,
    textAlign: 'center', marginTop: 11, marginBottom: 21 },
  attendant: { borderWidth: 1, borderColor: '#D6C9FF', backgroundColor: '#F8F5FF',
    minHeight: 74, borderRadius: 17, flexDirection: 'row', gap: 11, padding: 12, alignItems: 'center' },
  avatar: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#E8E1FF',
    alignItems: 'center', justifyContent: 'center' },
  attendantInfo: { flex: 1 },
  attendantCaption: { color: colors.brandDark, letterSpacing: 0.6, fontWeight: '900', fontSize: 9 },
  attendantName: { color: colors.ink, fontWeight: '800', fontSize: 14, marginTop: 5 },
  error: { backgroundColor: '#FFF6ED', padding: 12, borderRadius: 12, flexDirection: 'row',
    gap: 8, marginTop: 12, alignItems: 'center' },
  errorText: { flex: 1, color: '#985A35', fontSize: 12, lineHeight: 18 },
  primary: { backgroundColor: colors.brand, minHeight: 53, borderRadius: 16, paddingHorizontal: 13,
    flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 19 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  cancelText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
});
