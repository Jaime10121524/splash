import { Tabs, Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '../../src/AuthContext';
import { colors } from '../../src/theme';
import {useTheme,useThemedStyles} from '../../src/ThemeContext';

export default function TabsLayout() {
  const { user, ready } = useAuth();
  const {palette}=useTheme();
  const styles=useThemedStyles(lightStyles);
  const insets = useSafeAreaInsets();
  if (ready && !user) return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: palette.brandDark,
      tabBarInactiveTintColor: palette.muted,
      // Reserva a área da barra de gestos/navegação Android. O texto do menu
      // fica acima dela inclusive com edge-to-edge ativo.
      tabBarStyle: {
        height: 67 + insets.bottom,
        paddingTop: 5, paddingBottom: insets.bottom + 5,
        borderTopWidth: 0, backgroundColor: palette.surface, elevation: 6,
        overflow: 'visible',
      },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 3 },
      tabBarItemStyle: { paddingTop: 3 },
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
        // Ícone e legenda ficam em um único botão, com espaços independentes;
        // evita legenda sobre o círculo e sombra deslocada no Android.
        tabBarButton: props => <Pressable
          onPress={props.onPress}
          accessibilityRole="button"
          accessibilityLabel={props.accessibilityLabel || 'Escanear QR Code'}
          accessibilityState={props.accessibilityState}
          style={styles.scanSlot}>
          <View style={styles.scanCircle}>
            <SymbolView name={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner' }}
              size={29} tintColor="#FFFFFF" />
          </View>
          <Text style={styles.scanLabel}>Escanear</Text>
        </Pressable>,
      }} />
      <Tabs.Screen name="atendimentos" options={{
        title: 'Atendimentos',
        tabBarIcon: ({ color }) => <SymbolView name={{ ios: 'person.2', android: 'groups' }} size={24} tintColor={color} />,
      }} />
      <Tabs.Screen name="mais" options={{
        title: 'Mais',
        tabBarIcon: ({color}) => <SymbolView name={{ios:'square.grid.2x2.fill',android:'apps'}} size={23} tintColor={color}/>,
      }}/>
    </Tabs>
  );
}

const lightStyles = StyleSheet.create({
  scanSlot: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-start',
    overflow: 'visible',
  },
  scanCircle: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 4,
    borderColor: '#FFFFFF', backgroundColor: colors.brandDark,
    alignItems: 'center', justifyContent: 'center', marginTop: -19,
    shadowColor: colors.navy, shadowOpacity: .18,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 3,
  },
  scanLabel: {
    fontSize: 10, lineHeight: 13, fontWeight: '900',
    color: colors.brandDark, marginTop: 3, includeFontPadding: false,
  },
});
