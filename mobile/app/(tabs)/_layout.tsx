import { Tabs, Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '../../src/AuthContext';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const { user, ready } = useAuth();
  if (ready && !user) return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: colors.brandDark,
      tabBarInactiveTintColor: '#948AAE',
      tabBarStyle: { borderTopWidth: 0, backgroundColor: '#FFFFFF', paddingTop: 7,
        minHeight: 70, elevation: 10, overflow: 'visible' },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Início',
        tabBarIcon: ({ color, focused }) => <SymbolView name={{ ios: focused ? 'house.fill' : 'house', android: 'home' }} size={24} tintColor={color} />,
      }} />
      <Tabs.Screen name="agendamentos" options={{
        title: 'Agenda',
        tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'calendar', android: 'event' }} size={23} tintColor={color} />,
      }} />
      <Tabs.Screen name="escanear" options={{
        title: 'Escanear',
        tabBarIcon: () => <View style={styles.scanCircle}>
          <SymbolView name={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner' }}
            size={31} tintColor="#FFFFFF" />
        </View>,
        tabBarLabel: () => <Text style={styles.scanLabel}>Escanear</Text>,
      }} />
      <Tabs.Screen name="atendimentos" options={{
        title: 'Atendimentos',
        tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.2', android: 'groups' }} size={24} tintColor={color} />,
      }} />
      <Tabs.Screen name="clientes" options={{
        title: 'Clientes',
        tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.crop.rectangle.stack', android: 'contacts' }} size={23} tintColor={color} />,
      }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanCircle: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 5,
    borderColor: '#FFFFFF', backgroundColor: colors.brandDark,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -27, shadowColor: colors.navy, shadowOpacity: .32,
    shadowOffset: { width: 0, height: 6 }, shadowRadius: 11, elevation: 10,
  },
  scanLabel: { fontSize: 10, fontWeight: '900', color: colors.brandDark, marginTop: -6 },
});
