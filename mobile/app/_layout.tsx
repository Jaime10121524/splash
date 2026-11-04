import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { AuthProvider } from '../src/AuthContext';
import {ThemeProvider,useTheme} from '../src/ThemeContext';

function AppNavigation(){
  const {resolved,palette}=useTheme();
  return (
    <>
      <StatusBar barStyle={resolved==='dark'?'light-content':'dark-content'}
        backgroundColor={palette.background}/>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="atendimento/[id]" />
        <Stack.Screen name="atendimento/novo" />
        <Stack.Screen name="cliente/[id]" />
        <Stack.Screen name="venda/[id]" />
        <Stack.Screen name="vendas" />
        <Stack.Screen name="clientes" />
        <Stack.Screen name="notificacoes" />
        <Stack.Screen name="perfil" />
      </Stack>
    </>
  );
}
export default function RootLayout(){
  return <ThemeProvider><AuthProvider><AppNavigation/></AuthProvider></ThemeProvider>;
}
