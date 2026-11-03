import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { AuthProvider } from '../src/AuthContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar barStyle="dark-content" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="atendimento/[id]" />
        <Stack.Screen name="atendimento/novo" />
        <Stack.Screen name="cliente/[id]" />
      </Stack>
    </AuthProvider>
  );
}
