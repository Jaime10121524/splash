import {Stack, usePathname, useRouter} from 'expo-router';
import {Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {SymbolView} from 'expo-symbols';
import {AuthProvider, useAuth} from '../src/AuthContext';
import {ThemeProvider, useTheme} from '../src/ThemeContext';

const items=[
  {key:'inicio',label:'Início',href:'/(tabs)',ios:'house',android:'home'},
  {key:'agenda',label:'Agenda',href:'/(tabs)/agendamentos',ios:'calendar',android:'event'},
  {key:'escanear',label:'Escanear',href:'/(tabs)/escanear',ios:'qrcode.viewfinder',android:'qr_code_scanner'},
  {key:'atendimentos',label:'Atendimentos',href:'/(tabs)/atendimentos',ios:'person.2',android:'groups'},
  {key:'mais',label:'Mais',href:'/(tabs)/mais',ios:'square.grid.2x2.fill',android:'apps'},
] as const;

/** Menu persistente fora do Stack: não desaparece ao abrir detalhes ou formulários. */
function PersistentMenu(){
  const {ready,user}=useAuth();
  const {palette}=useTheme();
  const {bottom}=useSafeAreaInsets();
  const pathname=usePathname();
  const router=useRouter();
  if(!ready||!user||pathname==='/login')return null;
  const active=pathname.startsWith('/agendamentos')?'agenda':
    pathname.startsWith('/escanear')?'escanear':
    pathname.startsWith('/atendimentos')||pathname.startsWith('/atendimento/')?'atendimentos':
    pathname.startsWith('/mais')||pathname.startsWith('/venda')||
      pathname.startsWith('/cliente')||pathname.startsWith('/perfil')||
      pathname.startsWith('/notificacoes')?'mais':'inicio';
  return <View style={[styles.bar,{height:67+bottom,paddingBottom:bottom+5,
    backgroundColor:palette.surface,borderTopColor:palette.line}]}>
    {items.map(item=>{
      const selected=active===item.key;
      const tint=selected?palette.brandDark:palette.muted;
      const scan=item.key==='escanear';
      return <Pressable key={item.key} onPress={()=>router.navigate(item.href as never)}
        accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={item.label}
        style={styles.item}>
        {scan?<View style={[styles.scanCircle,{backgroundColor:palette.brandDark}]}>
          <SymbolView name={{ios:item.ios as any,android:item.android as any}}
            size={28} tintColor="#FFFFFF"/>
        </View>:<SymbolView name={{ios:(item.key==='inicio'&&selected?'house.fill':item.ios) as any,
          android:item.android as any}} size={24} tintColor={tint}/>}
        <Text style={[styles.label,{color:scan?palette.brandDark:tint}]}>{item.label}</Text>
      </Pressable>;
    })}
  </View>;
}

function AppNavigation(){
  const {resolved,palette}=useTheme();
  return <>
    <StatusBar barStyle={resolved==='dark'?'light-content':'dark-content'}/>
    <View style={{flex:1,backgroundColor:palette.background}}>
      <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:palette.background},
        animation:'slide_from_right'}}>
        <Stack.Screen name="index"/>
        <Stack.Screen name="login"/>
        <Stack.Screen name="(tabs)"/>
        <Stack.Screen name="atendimento/[id]"/>
        <Stack.Screen name="atendimento/novo"/>
        <Stack.Screen name="cliente/[id]"/>
        <Stack.Screen name="venda/[id]"/>
        <Stack.Screen name="vendas"/>
        <Stack.Screen name="clientes"/>
        <Stack.Screen name="notificacoes"/>
        <Stack.Screen name="perfil"/>
      </Stack>
      <PersistentMenu/>
    </View>
  </>;
}
export default function RootLayout(){
  return <ThemeProvider><AuthProvider><AppNavigation/></AuthProvider></ThemeProvider>;
}

const styles=StyleSheet.create({
  bar:{flexDirection:'row',paddingTop:5,borderTopWidth:StyleSheet.hairlineWidth,
    elevation:6,overflow:'visible',zIndex:10},
  item:{flex:1,alignItems:'center',justifyContent:'center',gap:3,overflow:'visible'},
  label:{fontSize:10,fontWeight:'700',includeFontPadding:false,textAlign:'center'},
  scanCircle:{width:60,height:60,borderRadius:30,borderWidth:4,
    borderColor:'#FFFFFF',alignItems:'center',justifyContent:'center',
    marginTop:-19,shadowColor:'#24184E',shadowOpacity:.18,
    shadowOffset:{width:0,height:2},shadowRadius:3,elevation:3},
});
