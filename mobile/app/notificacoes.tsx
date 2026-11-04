import {useThemedStyles} from '../src/ThemeContext';
import {useCallback,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import {apiRequest} from '../src/api';
import {useAuth} from '../src/AuthContext';
import {colors} from '../src/theme';

type Notice={id:number;chave_evento:string;categoria:string;titulo:string;mensagem:string;
  rota:string|null;valor_proprio:string|null;lido_em:string|null;criado_em:string};
type Data={avisos:Notice[];nao_lidas:number};
const paid=new Set(['VENDA_PAGA']),sale=new Set(['VENDA_REGISTRADA','COMISSAO_APURADA']);
function dateBR(value:string){const m=value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
  return m?m[3]+'/'+m[2]+' às '+m[4]:value;}
function formatMoney(v:string){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));}
export default function Notifications(){
  const s=useThemedStyles(lightStyles);
  const {token}=useAuth();
  const [data,setData]=useState<Data>({avisos:[],nao_lidas:0});
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!token)return;
    try{const response=await apiRequest<Data>('mobile/notificacoes',{token});
      setData(response);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Erro ao carregar avisos.');}
    finally{setLoading(false);setRefreshing(false);}
  },[token]);
  useFocusEffect(useCallback(()=>{
    void load();
    // A lista de notificações existentes é sincronizada periodicamente enquanto
    // esta tela está aberta; push fora do aplicativo depende de integração FCM nativa.
    const refreshId=setInterval(()=>{void load();},30000);
    return ()=>clearInterval(refreshId);
  },[load]));
  async function readAll(){
    if(!token||busy||!data.nao_lidas)return;
    setBusy(true);
    try{await apiRequest('mobile/notificacoes/ler-todas',{token,method:'POST',body:{}});
      await load();Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível marcar as notificações.');}
    finally{setBusy(false);}
  }
  async function open(item:Notice){
    if(!token)return;
    if(!item.lido_em){
      try{await apiRequest('mobile/notificacoes/'+item.id+'/ler',{token,method:'POST',body:{}});
        setData(current=>({...current,nao_lidas:Math.max(0,current.nao_lidas-1),
          avisos:current.avisos.map(n=>n.id===item.id?{...n,lido_em:new Date().toISOString()}:n)}));}
      catch(e){setError(e instanceof Error?e.message:'Não foi possível marcar a notificação.');}
    }
    if(item.rota==='vendas'){
      const m=item.chave_evento.match(/^(?:VENDA_REGISTRADA|VENDA_PAGA|COMISSAO_APURADA):(\d+)$/);
      if(m)router.push({pathname:'/venda/[id]',params:{id:m[1]}});
      else router.push('/vendas');
    }
    else if(item.rota==='atendimentos')router.push('/(tabs)/atendimentos');
    else if(item.rota==='clientes')router.push('/clientes');
  }
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}
        tintColor={colors.brand}/>}>
      <View style={s.heading}>
        <Pressable style={s.back} onPress={()=>router.back()} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'arrow.left',android:'arrow_back'}} size={21} tintColor={colors.ink}/>
        </Pressable>
        <View style={{flex:1}}><Text style={s.kicker}>CENTRAL SPLASH</Text><Text style={s.title}>Notificações</Text></View>
      </View>
      <View style={s.hero}>
        <View style={s.heroIcon}><SymbolView name={{ios:'bell.badge.fill',android:'notifications_active'}}
          size={30} tintColor="#FFFFFF"/></View>
        <View style={{flex:1}}>
          <Text style={s.heroTitle}>{data.nao_lidas?data.nao_lidas+' novas atualizações':'Tudo em dia!'}</Text>
          <Text style={s.heroSub}>Vendas, pagamentos e notícias da sua operação.</Text>
        </View>
      </View>
      <View style={s.actions}>
        <Text style={s.section}>Últimas atividades</Text>
        <Pressable disabled={!data.nao_lidas||busy} onPress={()=>{void readAll();}}
          style={[s.readAll,(!data.nao_lidas||busy)&&{opacity:.45}]}>
          <Text style={s.readAllText}>Ler todas</Text>
        </Pressable>
      </View>
      {!!error&&<View style={s.error}><Text style={s.errorText}>{error}</Text></View>}
      {loading?<ActivityIndicator size="large" color={colors.brand} style={{marginTop:34}}/>:
        data.avisos.length?data.avisos.map(item=>{
          const isPaid=paid.has(item.categoria),isSale=sale.has(item.categoria);
          const big=isPaid||isSale;
          return <Pressable key={item.id} onPress={()=>{void open(item);}}
            style={[s.item,big&&s.saleCard,!item.lido_em&&s.unreadCard]}>
            <View style={[s.categoryIcon,isPaid&&s.paidIcon,isSale&&!isPaid&&s.saleIcon]}>
              <Text style={s.emoji}>{isPaid?'💰':isSale?'🎉':'🔔'}</Text>
            </View>
            <View style={{flex:1,gap:5}}>
              <View style={s.meta}>
                <Text style={[s.category,big&&s.categorySale]}>
                  {isPaid?'VENDA QUITADA':isSale?'CONQUISTA COMERCIAL':'SPLASH'}
                </Text>
                {!item.lido_em&&<View style={s.dot}/>}
              </View>
              <Text style={s.itemTitle}>{item.titulo}</Text>
              <Text style={s.itemMessage}>{item.mensagem}</Text>
              {item.valor_proprio!==null&&<View style={s.amountTag}>
                <Text style={s.amountText}>Seu valor: {formatMoney(item.valor_proprio)}</Text>
              </View>}
              <Text style={s.date}>{dateBR(item.criado_em)}</Text>
            </View>
            {item.rota?<SymbolView name={{ios:'chevron.right',android:'chevron_right'}}
              size={16} tintColor={colors.muted}/>:null}
          </Pressable>;
        }):<View style={s.empty}><Text style={s.emptyEmoji}>✨</Text>
          <Text style={s.emptyTitle}>Nenhuma notificação ainda</Text>
          <Text style={s.emptyText}>Os novos avisos de vendas e atendimentos aparecerão aqui.</Text>
        </View>}
    </ScrollView>
  </SafeAreaView>;
}
const lightStyles = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{paddingHorizontal:18,paddingTop:15,paddingBottom:60,gap:13},
  heading:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:43,height:43,borderRadius:13,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
  kicker:{color:colors.brandDark,letterSpacing:1.1,fontSize:10,fontWeight:'900'},
  title:{color:colors.ink,fontWeight:'900',fontSize:25},
  hero:{padding:20,backgroundColor:colors.navy,borderRadius:23,
    flexDirection:'row',alignItems:'center',gap:14,marginTop:9},
  heroIcon:{width:55,height:55,backgroundColor:'#5944A2',borderRadius:18,alignItems:'center',justifyContent:'center'},
  heroTitle:{color:'#FFFFFF',fontSize:18,fontWeight:'900'},
  heroSub:{color:'#E5DCFF',fontSize:12,marginTop:5,lineHeight:18},
  actions:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12},
  section:{color:colors.ink,fontSize:16,fontWeight:'900'},
  readAll:{padding:10,backgroundColor:colors.pale,borderRadius:12},
  readAllText:{color:colors.brandDark,fontSize:12,fontWeight:'900'},
  item:{backgroundColor:'#FFFFFF',padding:15,borderRadius:19,flexDirection:'row',gap:12,
    alignItems:'flex-start',borderWidth:1,borderColor:'#F0EDF5'},
  saleCard:{borderColor:'#E7DEFF',backgroundColor:'#FDFBFF'},
  unreadCard:{borderLeftColor:colors.brand,borderLeftWidth:4},
  categoryIcon:{width:45,height:45,borderRadius:16,backgroundColor:'#E9F0FF',alignItems:'center',justifyContent:'center'},
  paidIcon:{backgroundColor:'#E2F8EC'},saleIcon:{backgroundColor:'#F2E7FF'},
  emoji:{fontSize:23},
  meta:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  category:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:colors.muted},
  categorySale:{color:colors.brandDark},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.brand},
  itemTitle:{fontSize:15,fontWeight:'900',color:colors.ink,lineHeight:20},
  itemMessage:{fontSize:12,color:colors.muted,lineHeight:19},
  date:{color:'#928DA0',fontSize:10,marginTop:3},
  amountTag:{backgroundColor:'#E6F8EC',paddingVertical:7,paddingHorizontal:9,
    borderRadius:9,alignSelf:'flex-start'},
  amountText:{color:'#147148',fontSize:12,fontWeight:'900'},
  error:{backgroundColor:'#FFF0E9',padding:13,borderRadius:13},
  errorText:{color:colors.danger,fontSize:12},
  empty:{alignItems:'center',padding:36,backgroundColor:'#FFFFFF',borderRadius:23,gap:9},
  emptyEmoji:{fontSize:37},emptyTitle:{fontSize:17,fontWeight:'900',color:colors.ink},
  emptyText:{color:colors.muted,fontSize:12,textAlign:'center',lineHeight:19},
});
