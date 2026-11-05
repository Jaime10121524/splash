import {useProtectedPhoto} from '../../src/useProtectedPhoto';
import ThemeSettings from '../../src/components/ThemeSettings';
import {useThemedStyles} from '../../src/ThemeContext';
import {useCallback,useState} from 'react';
import {ActivityIndicator,Image,Linking,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import * as Notifications from 'expo-notifications';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../../src/api';
import {useAuth} from '../../src/AuthContext';
import {colors} from '../../src/theme';
import {isExpoGo} from '../../src/runtime';

type Entry={title:string;subtitle:string;ios:string;android:string;route:string;count?:number};
function MenuLink({entry}:{entry:Entry}){
  const router=useRouter();
  const s=useThemedStyles(lightStyles);
  return <Pressable style={s.entry} onPress={()=>router.push(entry.route as never)} accessibilityRole="button">
    <View style={s.entryIcon}><SymbolView name={{ios:entry.ios as any,android:entry.android as any}} size={23} tintColor={colors.brandDark}/></View>
    <View style={{flex:1}}><Text style={s.entryTitle}>{entry.title}</Text>
      <Text style={s.entrySub}>{entry.subtitle}</Text></View>
    {!!entry.count&&<View style={s.count}><Text style={s.countText}>{entry.count>99?'99+':entry.count}</Text></View>}
    <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} size={20} tintColor={colors.muted}/>
  </Pressable>;
}
export default function Mais(){
  const router=useRouter();
  const s=useThemedStyles(lightStyles);
  const {user,token,logout}=useAuth();
  const [unread,setUnread]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [testingPush,setTestingPush]=useState(false),[pushMessage,setPushMessage]=useState('');
  const {uri:photoUri,reload:reloadPhoto}=useProtectedPhoto('mobile/me/foto',token);
  useFocusEffect(useCallback(()=>{
    if(!token)return;
    void reloadPhoto();
    let active=true;
    void apiRequest<{nao_lidas:number}>('mobile/notificacoes',{token})
      .then(d=>{if(active)setUnread(d.nao_lidas||0);}).catch(()=>{});
    return ()=>{active=false;};
  },[token,reloadPhoto]));
  async function testPush(){
    if(!token||testingPush)return;
    if(isExpoGo){
      setPushMessage('O Expo Go permite testar as telas, mas nao recebe push remoto do Firebase. Para testar notificacoes reais, use o APK Splash Next.');
      return;
    }
    setPushMessage('');setTestingPush(true);
    try{
      const permission=await Notifications.getPermissionsAsync();
      if(!permission.granted){
        setPushMessage('Notificações desativadas. Habilite nas configurações do Android.');
        return;
      }
      const r=await apiRequest<{message:string}>('mobile/notificacoes/testar',
        {token,method:'POST',body:{}});
      setPushMessage(r.message||'Teste enviado ao Firebase.');
    }catch(e){
      setPushMessage(e instanceof Error?e.message:'Não foi possível testar o push.');
    }finally{setTestingPush(false);}
  }
  async function signOut(){
    if(busy)return;
    setBusy(true);setError('');
    try{await logout();router.replace('/login');}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível sair da conta.');}
    finally{setBusy(false);}
  }
  const items:Entry[]=[
    ...(user?.role==='operador'?[]:[{title:'Vendas',
      subtitle:user?.role==='vendedor'?'Minhas comissões':'Títulos, pagamentos e comissões',
      ios:'bag.fill',android:'shopping_bag',route:'/vendas'}]),
    ...(user?.role==='vendedor'?[]:[{title:'Clientes',subtitle:'Carteira, contatos e cadastros',ios:'person.2.fill',android:'contacts',route:'/clientes'}]),
    ...(user?.role==='operador'||user?.role==='restrito'?[]:
      [{title:'Financeiro',subtitle:user?.role==='admin'
        ?'Comissões a pagar, a receber e já pagas':'Minhas comissões e recebimentos por período',
        ios:'banknote',android:'account_balance_wallet',route:'/financeiro'}]),

    {title:'Notificações',subtitle:'Novas vendas e alertas comerciais',ios:'bell.badge.fill',android:'notifications_active',route:'/notificacoes',count:unread},
    {title:'Meu perfil',subtitle:'Foto, e-mail e senha',ios:'person.crop.circle',android:'account_circle',route:'/perfil'},
  ];
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.kicker}>ÁREAS DO APLICATIVO</Text><Text style={s.title}>Mais opções</Text>
      <Text style={s.subtitle}>Tudo o que você precisa em um só lugar.</Text>
      <View style={s.userCard}>
        <View style={s.avatar}>{photoUri?<Image source={{uri:photoUri}} style={{width:53,height:53}}/>:
          <Text style={s.avatarText}>{user?.username?.slice(0,1).toUpperCase()||'?'}</Text>}
        </View>
        <View><Text style={s.userTitle}>{user?.username}</Text><Text style={s.userSub}>Conta conectada</Text></View>
      </View>
      <View style={s.links}>{items.map(i=><MenuLink key={i.title} entry={i}/>)}</View>
      <ThemeSettings/>
      <View style={s.pushCard}>
        <Text style={s.pushTitle}>Notificações do Android</Text>
        <Text style={s.pushDescription}>
          Receba alertas mesmo com o aplicativo fechado. Para verificar, envie um aviso de teste.
        </Text>
        <Pressable disabled={testingPush} style={s.pushTest} onPress={()=>{void testPush();}}
          accessibilityRole="button">
          {testingPush?<ActivityIndicator color="#FFFFFF"/>:
            <Text style={s.pushTestText}>Enviar notificação de teste</Text>}
        </Pressable>
        <Pressable onPress={()=>{void Linking.openSettings();}} accessibilityRole="button">
          <Text style={s.pushSettings}>Abrir permissões do aplicativo</Text>
        </Pressable>
        {!!pushMessage&&<Text style={s.pushFeedback}>{pushMessage}</Text>}
      </View>
      {!!error&&<Text style={s.error}>{error}</Text>}
      <Pressable disabled={busy} style={s.logout} onPress={()=>{void signOut();}}>
        {busy?<ActivityIndicator color={colors.danger}/>:
          <SymbolView name={{ios:'rectangle.portrait.and.arrow.right',android:'logout'}} size={20} tintColor={colors.danger}/>}
        <Text style={s.logoutText}>Sair da conta</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const lightStyles = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:20,paddingBottom:60,gap:10},
  kicker:{fontSize:10,letterSpacing:1.25,color:colors.brandDark,fontWeight:'900'},
  title:{fontSize:27,color:colors.ink,fontWeight:'900'},
  subtitle:{color:colors.muted,fontSize:13,marginBottom:11},
  userCard:{backgroundColor:colors.navy,borderRadius:21,marginVertical:8,padding:18,flexDirection:'row',alignItems:'center',gap:14},
  avatar:{backgroundColor:'#55409D',borderRadius:17,width:53,height:53,overflow:'hidden',alignItems:'center',justifyContent:'center'},
  avatarText:{color:'#FFFFFF',fontSize:22,fontWeight:'900'},
  userTitle:{color:'#FFFFFF',fontSize:17,fontWeight:'900'},
  userSub:{color:'#D5C8FF',fontSize:12,marginTop:4},
  links:{backgroundColor:'#FFFFFF',borderRadius:20,padding:5,overflow:'hidden'},
  entry:{flexDirection:'row',gap:12,padding:14,alignItems:'center',borderBottomWidth:1,borderBottomColor:'#F4F1FB'},
  entryIcon:{width:47,height:47,borderRadius:15,backgroundColor:colors.pale,alignItems:'center',justifyContent:'center'},
  entryTitle:{fontSize:15,fontWeight:'900',color:colors.ink},
  entrySub:{fontSize:11,color:colors.muted,marginTop:4},
  count:{backgroundColor:'#E6DBFF',borderRadius:11,paddingHorizontal:8,paddingVertical:4},
  countText:{color:colors.brandDark,fontWeight:'900',fontSize:12},
  logout:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#F7D8DE',marginTop:17,
    borderRadius:15,minHeight:54,justifyContent:'center',flexDirection:'row',alignItems:'center',gap:10},
  logoutText:{color:colors.danger,fontWeight:'900'},
  error:{color:colors.danger,fontSize:12},
  pushCard:{marginTop:7,backgroundColor:'#FFFFFF',borderRadius:19,padding:17,gap:11},
  pushTitle:{fontSize:15,fontWeight:'900',color:colors.ink},
  pushDescription:{fontSize:12,lineHeight:19,color:colors.muted},
  pushTest:{padding:13,minHeight:45,alignItems:'center',justifyContent:'center',
    borderRadius:12,backgroundColor:colors.brand},
  pushTestText:{color:'#FFFFFF',fontWeight:'900',fontSize:13},
  pushSettings:{color:colors.brandDark,fontWeight:'800',fontSize:12,textAlign:'center'},
  pushFeedback:{color:colors.ink,fontSize:12,lineHeight:19},
});
