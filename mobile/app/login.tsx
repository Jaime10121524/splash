import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../src/AuthContext';
import { colors } from '../src/theme';

export default function LoginScreen() {
  const { user, ready, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (ready && user) return <Redirect href="/(tabs)" />;

  async function submit() {
    if (busy || !username.trim() || !password) return;
    setBusy(true); setError('');
    try {
      await login(username, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.mark}><Text style={styles.markText}>s</Text><View style={styles.markDot} /></View>
          <Text style={styles.brand}>splash<Text style={{ color: colors.brand }}>.</Text></Text>
          <View style={styles.badge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>SEU ESPAÇO DE TRABALHO</Text></View>
          <Text style={styles.headline}>Tudo flui melhor{'\n'}por aqui.</Text>
          <Text style={styles.intro}>Suas visitas e atendimentos organizados, sem complicação.</Text>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Bem-vindo de volta</Text>
            <Text style={styles.panelSubtitle}>Entre com o mesmo acesso do Splash.</Text>
            <Text style={styles.label}>Usuário</Text>
            <TextInput
              style={styles.field} value={username} onChangeText={setUsername}
              placeholder="Seu usuário" placeholderTextColor="#9BA8B8"
              autoCapitalize="none" autoCorrect={false} returnKeyType="next"
              accessibilityLabel="Usuário" autoComplete="username"
            />
            <Text style={styles.label}>Senha</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.field, styles.passwordInput]} value={password} onChangeText={setPassword}
                placeholder="Sua senha" placeholderTextColor="#9BA8B8"
                secureTextEntry={!showPassword} onSubmitEditing={submit}
                returnKeyType="go" accessibilityLabel="Senha" autoComplete="current-password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eye} accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                <SymbolView name={{ ios: showPassword ? 'eye.slash' : 'eye', android: showPassword ? 'visibility_off' : 'visibility' }} size={20} tintColor={colors.muted}/>
              </Pressable>
            </View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={submit} disabled={busy || !username.trim() || !password}
              style={({ pressed }) => [styles.button, (busy || !username.trim() || !password) && styles.buttonDisabled, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel="Entrar no Splash"
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.buttonText}>Entrar no Splash</Text><SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={19} tintColor="#FFFFFF" /></>}
            </Pressable>
          </View>
          <Text style={styles.footer}>SPLASH · APLICATIVO NATIVO</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 44, paddingBottom: 30 },
  mark: { width: 59, height: 59, backgroundColor: colors.navy, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontWeight: '900', fontSize: 37, marginBottom: 6 },
  markDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, position: 'absolute', right: 11, bottom: 11 },
  brand: { marginTop: 13, color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 37 },
  badgeDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.brand },
  badgeText: { fontSize: 10, color: colors.brandDark, fontWeight: '800', letterSpacing: 1.2 },
  headline: { marginTop: 15, color: colors.ink, fontWeight: '900', fontSize: 33, lineHeight: 39, letterSpacing: -1 },
  intro: { color: colors.muted, marginTop: 12, fontSize: 14, lineHeight: 22, maxWidth: 285 },
  panel: { backgroundColor: '#FFFFFF', borderRadius: 26, padding: 23, marginTop: 33, borderColor: colors.line, borderWidth: 1 },
  panelTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  panelSubtitle: { color: colors.muted, fontSize: 13, marginTop: 6, marginBottom: 19 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 13 },
  field: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, height: 52, paddingHorizontal: 15, backgroundColor: '#F8FAFD', fontSize: 15, color: colors.ink },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 50 },
  eye: { position: 'absolute', right: 13, top: 5, width: 40, height: 42, justifyContent: 'center', alignItems: 'center' },
  error: { color: colors.danger, fontSize: 12, marginTop: 12, lineHeight: 18 },
  button: { backgroundColor: colors.brand, height: 53, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  footer: { color: '#9DA9B9', fontSize: 10, textAlign: 'center', fontWeight: '800', letterSpacing: 1.5, marginTop: 29 },
});
