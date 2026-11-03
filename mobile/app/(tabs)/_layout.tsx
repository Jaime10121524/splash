import { Tabs, Redirect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '../../src/AuthContext';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandDark,
      tabBarInactiveTintColor: '#94A0B2',
      tabBarStyle: { borderTopWidth: 0, backgroundColor: '#FFFFFF', height: 65, paddingTop: 8, paddingBottom: 8, elevation: 10 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Início',
        tabBarIcon: ({ color, focused }) => <SymbolView name={{ ios: focused ? 'house.fill' : 'house', android: 'home' }} size={24} tintColor={color} />,
      }} />
      <Tabs.Screen name="atendimentos" options={{
        title: 'Atendimentos',
        tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.2', android: 'groups' }} size={24} tintColor={color} />,
      }} />
      <Tabs.Screen name="perfil" options={{
        title: 'Perfil',
        tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.circle', android: 'account_circle' }} size={24} tintColor={color} />,
      }} />
    </Tabs>
  );
}
