import {useCallback,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../src/api';
import {useAuth} from '../src/AuthContext';
import {colors} from '../src/theme';

type Sale={id:number;visita_id:number|null;situacao:string;numero_titulo:string;
  sigla_plano:string;data_venda:string;valor_cobrado:string;cliente_nome:string};
const money=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
export default function Vendas(){
  const {token}=useAuth();
  const [sales,setSales]=useState<Sale[]>([]),[query,setQuery]=useState('');
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!token)return;
    try{
      const data=await apiRequest<{vendas:Sale[]}>('mobile/vendas',{token});
      setSales(data.vendas);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar vendas.');}
    finally{setLoading(false);setRefreshing(false);}
  },[token]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const filtered=sales.filter(x=>(x.cliente_nome+' '+x.numero_titulo+' '+x.sigla_plano+' '+x.id)
    .toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}
        tintColor={colors.brand}/>}>
      <View style={s.heading}><Pressable style={s.back} onPress={()=>router.back()} accessibilityLabel="Voltar">
        <SymbolView name={{ios:'arrow.left',android:'arrow_back'}} size={21} tintColor={colors.ink}/>
      </Pressable><View><Text style={s.kicker}>COMERCIAL / SPLASH</Text><Text style={s.title}>Vendas</Text></View></View>
      <View style={s.hero}><Text style={s.heroTitle}>Cada conquista conta.</Text>
        <Text style={s.heroSubtitle}>Consulte títulos, recebimentos e comissões.</Text>
        <View style={s.metric}><Text style={s.metricNumber}>{filtered.length}</Text>
          <Text style={s.metricLabel}>vendas exibidas</Text></View>
      </View>
      <View style={s.search}>
        <SymbolView name={{ios:'magnifyingglass',android:'search'}} size={21} tintColor={colors.muted}/>
        <TextInput placeholder="Buscar por cliente ou título" value={query} onChangeText={setQuery}
          style={s.searchInput} placeholderTextColor="#A8A2B3"/>
      </View>
      <Pressable style={s.newButton} onPress={()=>router.push('/(tabs)/atendimentos')}>
        <SymbolView name={{ios:'plus.circle.fill',android:'add_circle'}} size={19} tintColor="#FFFFFF"/>
        <Text style={s.newText}>Nova venda: escolher atendimento</Text>
      </Pressable>
      {!!error&&<View style={s.error}><Text style={s.errorText}>{error}</Text></View>}
      {loading?<ActivityIndicator color={colors.brand} size="large" style={{marginTop:35}}/>:
        filtered.length?filtered.map(v=><Pressable key={v.id} style={s.card}
          onPress={()=>router.push({pathname:'/venda/[id]',params:{id:String(v.id)}})}>
          <View style={s.row}><Text style={s.kicker}>TÍTULO {v.numero_titulo} {v.sigla_plano}</Text>
            <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} size={21} tintColor={colors.brandDark}/>
          </View>
          <Text style={s.client}>{v.cliente_nome}</Text>
          <View style={s.row}><Text style={s.price}>{money(v.valor_cobrado)}</Text>
            <Text style={s.date}>{v.data_venda}</Text></View>
        </Pressable>):<View style={s.empty}><Text style={s.emptyEmoji}>🛍️</Text>
          <Text style={s.emptyTitle}>Nenhuma venda encontrada</Text>
          <Text style={s.emptyText}>Finalize um atendimento como venda para cadastrar o título.</Text>
        </View>}
    </ScrollView>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:45,gap:13},
  heading:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:43,height:43,backgroundColor:'#FFFFFF',borderRadius:13,alignItems:'center',justifyContent:'center'},
  kicker:{fontSize:10,color:colors.brandDark,fontWeight:'900',letterSpacing:.9},
  title:{fontSize:25,fontWeight:'900',color:colors.ink},
  hero:{backgroundColor:colors.navy,borderRadius:22,padding:20,gap:8},
  heroTitle:{fontSize:20,fontWeight:'900',color:'#FFFFFF'},
  heroSubtitle:{fontSize:12,color:'#DDD4FA'},
  metric:{flexDirection:'row',alignItems:'baseline',gap:8,marginTop:6},
  metricNumber:{fontSize:28,fontWeight:'900',color:'#FFFFFF'},
  metricLabel:{fontSize:12,color:'#D8CDF8'},
  search:{backgroundColor:'#FFFFFF',borderRadius:15,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:10},
  searchInput:{height:50,flex:1,fontSize:14,color:colors.ink},
  newButton:{backgroundColor:colors.brand,borderRadius:15,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},
  newText:{fontSize:13,fontWeight:'900',color:'#FFFFFF'},
  card:{backgroundColor:'#FFFFFF',padding:17,borderRadius:19,gap:9,borderWidth:1,borderColor:colors.line},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  client:{fontWeight:'900',fontSize:16,color:colors.ink},
  price:{fontWeight:'900',fontSize:16,color:colors.brandDark},
  date:{fontSize:11,color:colors.muted},
  error:{backgroundColor:'#FFF0E9',padding:13,borderRadius:13},
  errorText:{color:colors.danger,fontSize:12},
  empty:{backgroundColor:'#FFFFFF',borderRadius:21,padding:30,alignItems:'center',gap:9},
  emptyEmoji:{fontSize:34},emptyTitle:{fontSize:17,fontWeight:'900',color:colors.ink},
  emptyText:{color:colors.muted,fontSize:12,textAlign:'center',lineHeight:20},
});
