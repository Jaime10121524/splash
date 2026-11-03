import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../src/AuthContext';
import { ApiError, apiRequest } from '../src/api';

const navy = '#0C2737';
const accent = '#05AFA1';
const accentLight = '#72EADB';
const background = '#F3F6F8';
const ink = '#193144';
const subdued = '#758897';

type ErrorKind = 'credentials' | 'connection' | 'server';

function Mark({ size = 39 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: Math.round(size * 0.32) }]}>
      <View style={styles.markLines}>
        <View style={[styles.markLine, { height: size * 0.30 }]} />
        <View style={[styles.markLine, { height: size * 0.43 }]} />
        <View style={[styles.markLine, { height: size * 0.25 }]} />
      </View>
      <View style={styles.markDot} />
    </View>
  );
}

function InputSymbol({ kind, color }: { kind: 'user' | 'lock'; color: string }) {
  return (
    <SymbolView
      name={kind === 'user'
        ? { ios: 'person', android: 'person_outline' }
        : { ios: 'lock', android: 'lock_outline' }}
      size={20}
      tintColor={color}
    />
  );
}

export default function LoginScreen() {
  const { user, ready, login } = useAuth();
  const { height } = useWindowDimensions();
  const smallerDisplay = height < 740;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const passwordField = useRef<ComponentRef<typeof TextInput>>(null);
  const feedbackMotion = useRef(new Animated.Value(0)).current;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<'username' | 'password' | null>(null);
  const [compact, setCompact] = useState(false);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<ErrorKind>('credentials');
  const [connection, setConnection] = useState('');

  useEffect(() => {
    Animated.timing(feedbackMotion, {
      toValue: error ? 1 : 0,
      duration: 230,
      useNativeDriver: true,
    }).start();
  }, [error, feedbackMotion]);

  if (ready && user) return <Redirect href="/(tabs)" />;

  function activateField(field: 'username' | 'password') {
    setCompact(true);
    setFocused(field);
    // Depois de reduzir o cabeçalho, o formulário fica no alto da tela.
    setTimeout(() => scroll.current?.scrollTo({ y: 48, animated: true }), 120);
  }

  async function submit() {
    if (busy || checking || !username.trim() || !password) return;
    Keyboard.dismiss();
    setBusy(true);
    setError('');
    setConnection('');

    try {
      await login(username, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/(tabs)');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setErrorKind('credentials');
        setError('Confira o usuário e a senha. Você pode tentar novamente.');
      } else if (cause instanceof ApiError && (cause.status === 0 || cause.status === 408)) {
        setErrorKind('connection');
        setError(cause.message);
      } else {
        setErrorKind('server');
        setError(cause instanceof Error ? cause.message : 'Não conseguimos concluir seu acesso agora.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (busy || checking) return;
    Keyboard.dismiss();
    setChecking(true);
    setConnection('');
    setError('');
    try {
      const status = await apiRequest<{ ok: boolean }>('mobile/ping', { timeoutMs: 7000 });
      setConnection(status.ok ? 'Conexão com a API funcionando.' : 'A API não confirmou a conexão.');
    } catch (cause) {
      setConnection(cause instanceof Error ? cause.message : 'Não foi possível conectar.');
    } finally {
      setChecking(false);
    }
  }

  const errorTitle = errorKind === 'credentials'
    ? 'Acesso não autorizado'
    : errorKind === 'connection' ? 'Sem resposta da conexão' : 'Não foi possível entrar';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={navy} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, compact && styles.heroCompact, smallerDisplay && !compact && styles.heroSmall]}>
            <View style={styles.orbitLarge} />
            <View style={styles.orbitSmall} />
            <View style={styles.brandRow}>
              <View style={styles.brandLeft}>
                <Mark />
                <Text style={styles.brandName}>splash<Text style={styles.brandPeriod}>.</Text></Text>
              </View>
              <View style={styles.versionPill}>
                <View style={styles.onlineDot} />
                <Text style={styles.versionText}>MOBILE</Text>
              </View>
            </View>

            {!compact && (
              <View style={[styles.heroWords, smallerDisplay && styles.heroWordsSmall]}>
                <Text style={styles.heroEyebrow}>SEU DIA, EM MOVIMENTO</Text>
                <Text style={styles.heroTitle}>Tudo na mão.{'\n'}Tudo fluindo.</Text>
                <Text style={styles.heroDescription}>
                  Seu trabalho mais simples, do primeiro contato ao resultado.
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.formCard, compact && styles.formCardCompact]}>
            <View style={styles.welcomeRow}>
              <View style={styles.welcomeText}>
                <Text style={styles.welcome}>Entrar no Splash</Text>
                <Text style={styles.welcomeDetail}>Acesse seu espaço de trabalho.</Text>
              </View>
              <View style={styles.lockBubble}>
                <SymbolView
                  name={{ ios: 'lock.shield', android: 'verified_user' }}
                  tintColor="#078C82"
                  size={21}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Usuário</Text>
            <View style={[styles.fieldBox, focused === 'username' && styles.fieldFocused]}>
              <InputSymbol kind="user" color={focused === 'username' ? accent : '#8193A3'} />
              <TextInput
                style={styles.field}
                placeholder="Seu usuário"
                placeholderTextColor="#96A4B0"
                value={username}
                onChangeText={(value) => { setUsername(value); if (error) setError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                onFocus={() => activateField('username')}
                onBlur={() => setFocused(null)}
                onSubmitEditing={() => passwordField.current?.focus()}
                blurOnSubmit={false}
                accessibilityLabel="Usuário do Splash"
              />
            </View>

            <Text style={[styles.fieldLabel, styles.passwordLabel]}>Senha</Text>
            <View style={[styles.fieldBox, focused === 'password' && styles.fieldFocused]}>
              <InputSymbol kind="lock" color={focused === 'password' ? accent : '#8193A3'} />
              <TextInput
                ref={passwordField}
                style={styles.field}
                placeholder="Digite sua senha"
                placeholderTextColor="#96A4B0"
                value={password}
                onChangeText={(value) => { setPassword(value); if (error) setError(''); }}
                secureTextEntry={!visiblePassword}
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={submit}
                onFocus={() => activateField('password')}
                onBlur={() => setFocused(null)}
                accessibilityLabel="Senha do Splash"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visiblePassword ? 'Ocultar senha' : 'Mostrar senha'}
                hitSlop={8}
                onPress={() => setVisiblePassword(!visiblePassword)}
                style={styles.eyeButton}
              >
                <SymbolView
                  name={visiblePassword
                    ? { ios: 'eye.slash', android: 'visibility_off' }
                    : { ios: 'eye', android: 'visibility' }}
                  size={20}
                  tintColor="#637F8F"
                />
              </Pressable>
            </View>

            {error ? (
              <Animated.View
                accessibilityRole="alert"
                style={[styles.feedback, {
                  opacity: feedbackMotion,
                  transform: [{
                    translateY: feedbackMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  }],
                }]}
              >
                <View style={styles.feedbackIcon}>
                  <SymbolView
                    name={{ ios: 'exclamationmark', android: 'priority_high' }}
                    size={18}
                    tintColor="#BB5F37"
                  />
                </View>
                <View style={styles.feedbackContent}>
                  <Text style={styles.feedbackTitle}>{errorTitle}</Text>
                  <Text style={styles.feedbackDescription}>{error}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" hitSlop={8} onPress={() => setError('')}>
                  <SymbolView name={{ ios: 'xmark', android: 'close' }} size={15} tintColor="#8D9BA4" />
                </Pressable>
              </Animated.View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Entrar no Splash"
              disabled={busy || checking || !username.trim() || !password}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                (busy || checking || !username.trim() || !password) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              {busy ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.buttonText}>Verificando seu acesso...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.buttonText}>Continuar</Text>
                  <View style={styles.buttonArrow}>
                    <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward' }} size={18} tintColor="#FFFFFF" />
                  </View>
                </>
              )}
            </Pressable>

            {__DEV__ ? (
              <View style={styles.debugBlock}>
                <Pressable
                  accessibilityRole="button"
                  onPress={testConnection}
                  disabled={busy || checking}
                  style={styles.testButton}
                >
                  {checking ? <ActivityIndicator size="small" color={accent} /> : (
                    <SymbolView name={{ ios: 'wifi', android: 'wifi' }} size={16} tintColor="#708B98" />
                  )}
                  <Text style={styles.testLabel}>Testar conexão com a API</Text>
                </Pressable>
                {connection ? (
                  <View style={styles.connectionMessage}>
                    <Text style={styles.connectionText}>{connection}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {!compact ? (
            <View style={styles.footer}>
              <View style={styles.footerLine} />
              <Text style={styles.footerText}>SPLASH NEXT  ·  FEITO PARA O SEU DIA</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: navy },
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: background },
  content: { flexGrow: 1, paddingBottom: 28 },
  hero: { minHeight: 320, backgroundColor: navy, paddingHorizontal: 25, paddingTop: 25, paddingBottom: 80, overflow: 'hidden' },
  heroSmall: { minHeight: 276, paddingBottom: 75 },
  heroCompact: { minHeight: 102, paddingBottom: 31, paddingTop: 17 },
  orbitLarge: { position: 'absolute', width: 320, height: 320, borderRadius: 160, borderWidth: 55, borderColor: '#1B4752', top: -134, right: -165, opacity: 0.48 },
  orbitSmall: { position: 'absolute', width: 116, height: 116, borderRadius: 58, borderWidth: 25, borderColor: '#347B7A', top: 170, right: -78, opacity: 0.27 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { backgroundColor: '#0EAC9E', justifyContent: 'center', alignItems: 'center' },
  markLines: { alignItems: 'center', flexDirection: 'row', gap: 3, transform: [{ rotate: '20deg' }] },
  markLine: { width: 4, backgroundColor: '#FFFFFF', borderRadius: 4 },
  markDot: { position: 'absolute', bottom: 6, right: 6, width: 5, height: 5, borderRadius: 4, backgroundColor: '#B0FFF5' },
  brandName: { fontSize: 22, color: '#FFFFFF', letterSpacing: -1.1, fontWeight: '800' },
  brandPeriod: { color: accentLight },
  versionPill: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: '#214353', borderRadius: 40, paddingHorizontal: 11, paddingVertical: 8 },
  versionText: { fontSize: 10, fontWeight: '800', color: '#D1E8EC', letterSpacing: 1.3 },
  onlineDot: { width: 6, height: 6, backgroundColor: accentLight, borderRadius: 5 },
  heroWords: { marginTop: 36, zIndex: 1, maxWidth: 330 },
  heroWordsSmall: { marginTop: 23 },
  heroEyebrow: { color: accentLight, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginBottom: 10 },
  heroTitle: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', letterSpacing: -1.5, lineHeight: 40 },
  heroDescription: { color: '#AEC6D0', fontSize: 12, lineHeight: 20, marginTop: 12, maxWidth: 275 },
  formCard: { marginHorizontal: 17, marginTop: -52, backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 16, borderWidth: 1, borderColor: '#EDF1F4', elevation: 5, shadowColor: navy, shadowOpacity: 0.07, shadowOffset: { width: 0, height: 9 }, shadowRadius: 23 },
  formCardCompact: { marginTop: -25 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 23 },
  welcomeText: { flex: 1 },
  welcome: { fontSize: 22, fontWeight: '800', color: ink, letterSpacing: -0.7 },
  welcomeDetail: { color: subdued, fontSize: 12.5, marginTop: 6 },
  lockBubble: { width: 41, height: 41, backgroundColor: '#E7F7F3', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 12, color: ink, fontWeight: '700', marginBottom: 8 },
  passwordLabel: { marginTop: 18 },
  fieldBox: { backgroundColor: '#F6F8FA', borderWidth: 1.5, borderColor: '#E9EEF1', borderRadius: 15, height: 54, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldFocused: { backgroundColor: '#F7FFFD', borderColor: '#52CDBE' },
  field: { flex: 1, color: ink, fontSize: 15, paddingVertical: 0, minWidth: 0, height: '100%' },
  eyeButton: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
  feedback: { marginTop: 16, borderRadius: 16, backgroundColor: '#FFF8F3', borderWidth: 1, borderColor: '#F6E6D8', flexDirection: 'row', alignItems: 'flex-start', padding: 13, gap: 10 },
  feedbackIcon: { width: 28, height: 28, borderRadius: 11, backgroundColor: '#FBEADC', alignItems: 'center', justifyContent: 'center' },
  feedbackContent: { flex: 1 },
  feedbackTitle: { color: '#704B34', fontWeight: '800', fontSize: 12.5 },
  feedbackDescription: { color: '#896C57', fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  primaryButton: { backgroundColor: accent, borderRadius: 16, height: 55, paddingHorizontal: 16, marginTop: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  buttonDisabled: { opacity: 0.52 },
  buttonPressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },
  buttonText: { fontWeight: '800', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.15 },
  buttonArrow: { position: 'absolute', right: 15, backgroundColor: '#2EC4B6', width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  debugBlock: { alignItems: 'center', paddingTop: 10 },
  testButton: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, minHeight: 40 },
  testLabel: { fontSize: 12, fontWeight: '600', color: '#708B98' },
  connectionMessage: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#EFF8F6', maxWidth: '100%' },
  connectionText: { fontSize: 11, color: '#487A77', textAlign: 'center', lineHeight: 17 },
  footer: { flexDirection: 'row', marginTop: 29, alignItems: 'center', justifyContent: 'center', gap: 9 },
  footerLine: { width: 18, height: 1, backgroundColor: '#B9C9CE' },
  footerText: { color: '#97ABB3', fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2 },
});
