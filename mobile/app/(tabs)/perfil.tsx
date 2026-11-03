import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '../../src/AuthContext';
import { roleName } from '../../src/api';
import { colors } from '../../src/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    try { await logout(); router.replace('/login'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível encerrar a sessão.'); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.root} edges={['top']}>
    <View style={styles.content}>
      <Text style={styles.eyebrow}>SUA CONTA</Text>
      <Text style={styles.title}>Meu perfil</Text>
      <View style={styles.card}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{user?.username?.slice(0, 1).toUpperCase() ?? '?'}</Text></View>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.role}>{roleName(user?.role ?? '')}</Text>
      </View>
      <View style={styles.info}>
        <SymbolView name={{ ios: 'lock.shield', android: 'verified_user' }} size={22} tintColor={colors.brandDark} />
        <Text style={styles.infoText}>Seus dados respeitam as permissões da sua conta. O aplicativo utiliza uma sessão segura, vinculada a este dispositivo.</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.logout} onPress={signOut} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.danger} /> : <SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout' }} size={20} tintColor={colors.danger} />}
        <Text style={styles.logoutText}>Sair da conta</Text>
      </Pressable>
      <Text style={styles.version}>Splash Next · Versão inicial 0.1</Text>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  eyebrow: { color: colors.brandDark, fontSize: 10, letterSpacing: 1.3, fontWeight: '900' },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900', marginTop: 8, marginBottom: 22 },
  card: { borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', padding: 25 },
  avatar: { width: 78, height: 78, borderRadius: 26, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.brandDark, fontSize: 30, fontWeight: '900' },
  username: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 13 },
  role: { color: colors.muted, fontSize: 13, marginTop: 5 },
  info: { flexDirection: 'row', gap: 12, backgroundColor: colors.pale, borderRadius: 18, padding: 18, marginTop: 18 },
  infoText: { flex: 1, color: colors.brandDark, fontSize: 12, lineHeight: 20 },
  error: { color: colors.danger, marginTop: 16, fontSize: 12 },
  logout: { height: 56, borderColor: '#F3D8DD', backgroundColor: '#FFFFFF', borderWidth: 1, borderRadius: 16, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  logoutText: { fontWeight: '800', fontSize: 14, color: colors.danger },
  version: { textAlign: 'center', color: '#9AA6B5', fontSize: 11, marginTop: 25 },
});
