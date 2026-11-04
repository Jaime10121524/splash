import {useThemedStyles} from '../ThemeContext';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { colors } from '../theme';

type Variant = 'confirm' | 'success' | 'warning' | 'error';
export default function ActionModal({
  visible, variant = 'confirm', title, description,
  primaryLabel, secondaryLabel = 'Voltar', onPrimary, onSecondary, busy = false,
}: {
  visible: boolean;
  variant?: Variant;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string | null;
  onPrimary: () => void;
  onSecondary?: () => void;
  busy?: boolean;
}) {
  const styles=useThemedStyles(lightStyles);
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      entrance.setValue(0);
      Animated.spring(entrance, {
        toValue: 1, friction: 10, tension: 70, useNativeDriver: true,
      }).start();
    }
  }, [visible, entrance]);

  const success = variant === 'success';
  const warning = variant === 'warning';
  const danger = variant === 'error';
  const close = onSecondary ?? onPrimary;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent
      onRequestClose={() => { if (!busy) close(); }}>
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <Pressable style={styles.backdrop} onPress={() => { if (!busy) close(); }}
          accessibilityLabel="Fechar mensagem" />
        <Animated.View style={[styles.sheet, {
          opacity: entrance,
          transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }]}>
          <View style={styles.topLine} />
          <View style={[styles.iconShell, success && styles.iconSuccess, warning && styles.iconWarning, danger && styles.iconError]}>
            <SymbolView
              name={success
                ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
                 : danger
                  ? { ios: 'xmark.octagon.fill', android: 'error' }
                  : warning
                    ? { ios: 'exclamationmark.circle.fill', android: 'warning' }
                    : { ios: 'checkmark.shield.fill', android: 'verified_user' }}
              size={33}
              tintColor={danger ? colors.danger : success ? '#388967' : warning ? '#C5853B' : colors.brand}
            />
          </View>
          <Text style={styles.eyebrow}>{danger ? 'PRECISA CORRIGIR' : success ? 'TUDO CERTO' : warning ? 'ATENÇÃO' : 'CONFIRMAÇÃO'}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <Pressable style={({ pressed }) => [
            styles.primary,
            busy && styles.disabled,
            pressed && !busy && styles.pressed,
          ]} disabled={busy} onPress={onPrimary} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
            {!busy && <SymbolView
              name={{ ios: success ? 'arrow.right' : 'checkmark', android: success ? 'arrow_forward' : 'check' }}
              size={18} tintColor="#FFFFFF" />}
          </Pressable>
          {!!secondaryLabel && !success && <Pressable style={styles.secondary} disabled={busy}
            onPress={close} accessibilityRole="button">
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </Pressable>}
          {!!secondaryLabel && success && <Pressable style={styles.secondary} disabled={busy}
            onPress={close} accessibilityRole="button">
            <Text style={styles.secondaryText}>{secondaryLabel}</Text>
          </Pressable>}
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const lightStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 23 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(23,16,50,0.62)' },
  sheet: { width: '100%', maxWidth: 390, backgroundColor: '#FFFFFF', borderRadius: 29, paddingTop: 25,
    paddingHorizontal: 26, paddingBottom: 20, alignItems: 'center',
    shadowColor: '#231744', shadowOpacity: 0.17, shadowRadius: 30, shadowOffset: { width: 0, height: 15 }, elevation: 18,
    overflow: 'hidden' },
  topLine: { position: 'absolute', left: 0, right: 0, height: 5, backgroundColor: colors.brand, top: 0 },
  iconShell: { width: 75, height: 75, borderRadius: 26, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  iconSuccess: { backgroundColor: '#E6F6EF' },
  iconWarning: { backgroundColor: '#FFF1DD' },
  iconError: { backgroundColor: '#FFF0E9' },
  eyebrow: { marginTop: 19, color: colors.brandDark, fontWeight: '800', letterSpacing: 1.65, fontSize: 10 },
  title: { textAlign: 'center', color: colors.ink, fontWeight: '900', fontSize: 23, lineHeight: 29, marginTop: 9 },
  description: { textAlign: 'center', color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 11, marginBottom: 25 },
  primary: { minHeight: 54, width: '100%', backgroundColor: colors.brand, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 13 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  secondary: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 5 },
  secondaryText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
});
