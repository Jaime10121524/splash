import {useProtectedPhoto} from '../../src/useProtectedPhoto';
import ThemeSettings from '../../src/components/ThemeSettings';
import {useThemedStyles} from '../../src/ThemeContext';
import {useCallback,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../../src/api';
import {useAuth} from '../../src/AuthContext';
import {colors} from '../../src/theme';

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
  const {uri:photoUri,reload:reloadPhoto}=useProtectedPhoto('mobile/me/foto',token);
  useFocusEffect(useCallback(()=>{
    if(!token)return;
    void reloadPhoto();
    let active=true;
    void apiRequest<{nao_lidas:number}>('mobile/notificacoes',{token})
      .then(d=>{if(active)setUnread(d.nao_lidas||0);}).catch(()=>{});
    return ()=>{active=false;};
  },[token,reloadPhoto]));
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
    {title:'Clientes',subtitle:'Carteira, contatos e cadastros',ios:'person.2.fill',android:'contacts',route:'/clientes'},
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
});
