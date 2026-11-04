import {useThemedStyles} from '../src/ThemeContext';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '../src/AuthContext';
import { apiRequest } from '../src/api';
import { maskPhoneBR } from '../src/phone';
import { colors } from '../src/theme';

type ClientRow = {
  id: number; nome: string; telefone: string; cpf?: string | null;
  email?: string | null; ativo: boolean; origem_nome?: string | null;
  dono_corrente_nome?: string | null; indicador_nome?: string | null;
};

export default function ClientesScreen() {
  const styles=useThemedStyles(lightStyles);
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [actual, setActual] = useState('');
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const job=setTimeout(()=>{setPage(1);setActual(query.trim());},300);
    return ()=>clearTimeout(job);
  },[query]);

  const load=useCallback(async (p=1)=>{
    if(!token)return;
    try{
      const result=await apiRequest<{clientes:ClientRow[];total:number}>(
        'mobile/clientes?page='+p+'&limit=25&q='+encodeURIComponent(actual),{token});
      setRows(prev=>p===1?result.clientes:[...prev,...result.clientes.filter(c=>!prev.some(v=>v.id===c.id))]);
      setTotal(result.total);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar clientes.');}
    finally{setLoading(false);setRefreshing(false);setMore(false);}
  },[token,actual]);

  useFocusEffect(useCallback(()=>{setLoading(true);setPage(1);void load(1);},[load]));
  async function next(){
    if(more || rows.length>=total)return;
    const p=page+1;setPage(p);setMore(true);await load(p);
  }
  async function whatsapp(phone:string){
    const digits=phone.replace(/\D/g,'');
    if(digits.length<10)return;
    const full=digits.startsWith('55')&&digits.length>=12?digits:'55'+digits;
    try{await Linking.openURL('https://wa.me/'+full);}
    catch{setError('Não foi possível abrir o WhatsApp.');}
  }
  const missing=(c:ClientRow)=>[!c.cpf,!c.email].filter(Boolean).length;
  return <SafeAreaView style={styles.root} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand}
        onRefresh={()=>{setRefreshing(true);void load(1);}}/>}>
      <Text style={styles.eyebrow}>SPLASH / CARTEIRA</Text>
      <Text style={styles.title}>Seus clientes</Text>
      <Text style={styles.subtitle}>Histórico, indicações e contatos com poucos toques.</Text>
      <View style={styles.hero}>
        <View><Text style={styles.heroLabel}>CARTEIRA</Text>
          <Text style={styles.heroNumber}>{total}</Text>
          <Text style={styles.heroSubtitle}>Cliente(s) encontrado(s)</Text>
        </View>
        <View style={styles.heroIcon}>
          <SymbolView name={{ios:'person.2.fill',android:'groups'}} size={35} tintColor="#DDD2FF"/>
        </View>
      </View>
      <Pressable onPress={()=>router.push({pathname:'/cliente/[id]',params:{id:'novo'}})}
        style={styles.primary} accessibilityRole="button">
        <SymbolView name={{ios:'person.crop.circle.badge.plus',android:'person_add'}} size={20} tintColor="#FFFFFF"/>
        <Text style={styles.primaryText}>Cadastrar cliente</Text>
        <SymbolView name={{ios:'arrow.right',android:'arrow_forward'}} size={19} tintColor="#FFFFFF"/>
      </Pressable>
      <View style={styles.search}>
        <SymbolView name={{ios:'magnifyingglass',android:'search'}} size={20} tintColor={colors.brandDark}/>
        <TextInput style={styles.input} value={query} onChangeText={setQuery} autoCorrect={false}
          placeholder="Nome, telefone ou CPF" placeholderTextColor="#A19AB5"/>
        {!!query&&<Pressable onPress={()=>setQuery('')} accessibilityLabel="Limpar">
          <SymbolView name={{ios:'xmark.circle.fill',android:'cancel'}} size={18} tintColor={colors.muted}/>
        </Pressable>}
      </View>
      <Text style={styles.section}>CADASTROS {rows.length>0?'('+rows.length+')':''}</Text>
      {!!error&&<View style={styles.error}><Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={()=>{void load(1);}}><Text style={styles.retry}>Tentar novamente</Text></Pressable></View>}
      {loading&&<ActivityIndicator style={{marginTop:26}} color={colors.brand}/>}
      {!loading&&!rows.length&&<View style={styles.empty}>
        <SymbolView name={{ios:'person.crop.circle',android:'person_outline'}} tintColor={colors.muted} size={30}/>
        <Text style={styles.emptyText}>Nenhum cliente encontrado.</Text>
      </View>}
      {rows.map(c=><Pressable key={c.id}
        onPress={()=>router.push({pathname:'/cliente/[id]',params:{id:String(c.id)}})}
        style={({pressed})=>[styles.card,pressed&&styles.pressed]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{c.nome.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{c.nome}</Text>
          <Text style={styles.phone}>{maskPhoneBR(c.telefone)}</Text>
          <View style={styles.tags}>
            {!!c.origem_nome&&<Text style={styles.tag}>{c.origem_nome}</Text>}
            {missing(c)>0&&<Text style={styles.pending}>Completar dados</Text>}
            {!c.ativo&&<Text style={styles.pending}>Inativo</Text>}
          </View>
        </View>
        <View style={styles.actions}>
          {!!c.telefone&&<Pressable onPress={()=>{void whatsapp(c.telefone);}}
            accessibilityRole="button" accessibilityLabel={'WhatsApp de '+c.nome} style={styles.whatsapp}>
            <SymbolView name={{ios:'bubble.left.and.bubble.right',android:'chat'}} size={20} tintColor={colors.brandDark}/>
          </Pressable>}
          <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} size={17} tintColor="#B8ADD5"/>
        </View>
      </Pressable>)}
      {rows.length<total&&<Pressable disabled={more} style={styles.more} onPress={()=>{void next();}}>
        {more?<ActivityIndicator color={colors.brand}/>:<Text style={styles.moreText}>Carregar mais clientes</Text>}
      </Pressable>}
    </ScrollView>
  </SafeAreaView>;
}

const lightStyles = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:19,paddingBottom:40,flexGrow:1},
  eyebrow:{color:colors.brandDark,fontWeight:'900',fontSize:10,letterSpacing:1.4},
  title:{fontSize:27,color:colors.ink,fontWeight:'900',marginTop:7},
  subtitle:{color:colors.muted,fontSize:12,marginTop:7,lineHeight:19},
  hero:{backgroundColor:colors.navy,marginTop:20,borderRadius:23,minHeight:132,padding:22,
    flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  heroLabel:{fontSize:10,color:'#D6CAFF',fontWeight:'900',letterSpacing:1.2},
  heroNumber:{fontSize:32,fontWeight:'900',color:'#FFFFFF',marginTop:5},
  heroSubtitle:{fontSize:11,color:'#E4DAFF',marginTop:5},
  heroIcon:{backgroundColor:'#4D397E',width:65,height:65,borderRadius:21,alignItems:'center',justifyContent:'center'},
  primary:{backgroundColor:colors.brand,borderRadius:16,minHeight:53,flexDirection:'row',gap:11,
    alignItems:'center',paddingHorizontal:17,marginTop:16},
  primaryText:{color:'#FFFFFF',fontWeight:'900',fontSize:14,flex:1},
  search:{backgroundColor:'#FFFFFF',borderRadius:16,borderWidth:1,borderColor:colors.line,
    flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,marginTop:20,height:52},
  input:{flex:1,color:colors.ink,fontSize:13,height:'100%'},
  section:{color:colors.brandDark,fontWeight:'900',fontSize:11,letterSpacing:1.1,marginTop:22,marginBottom:6},
  card:{backgroundColor:'#FFFFFF',borderRadius:18,minHeight:85,borderWidth:1,
    borderColor:colors.line,marginTop:10,padding:13,flexDirection:'row',alignItems:'center',gap:12},
  pressed:{opacity:.85},
  avatar:{width:46,height:46,backgroundColor:colors.pale,borderRadius:15,
    alignItems:'center',justifyContent:'center'},
  avatarText:{fontSize:20,fontWeight:'900',color:colors.brandDark},
  info:{flex:1,minWidth:0},
  name:{fontSize:13,fontWeight:'900',color:colors.ink},
  phone:{fontSize:11,color:colors.muted,marginTop:5},
  tags:{flexDirection:'row',gap:5,marginTop:7,flexWrap:'wrap'},
  tag:{fontSize:9,color:colors.brandDark,backgroundColor:colors.pale,paddingHorizontal:7,paddingVertical:4,borderRadius:8},
  pending:{fontSize:9,color:'#9C7046',backgroundColor:'#FFF3E7',paddingHorizontal:7,paddingVertical:4,borderRadius:8},
  actions:{alignItems:'center',gap:10},
  whatsapp:{width:30,height:30,alignItems:'center',justifyContent:'center'},
  more:{alignSelf:'center',padding:16,marginTop:8},
  moreText:{color:colors.brandDark,fontWeight:'800',fontSize:13},
  empty:{alignItems:'center',padding:30,backgroundColor:'#FFFFFF',borderRadius:19,marginTop:10},
  emptyText:{marginTop:8,color:colors.muted,fontSize:12},
  error:{backgroundColor:'#FFF3E9',padding:14,borderRadius:13,marginTop:10,flexDirection:'row',gap:10},
  errorText:{fontSize:11,color:'#9B6039',flex:1},
  retry:{color:colors.brandDark,fontSize:11,fontWeight:'900'},
});
