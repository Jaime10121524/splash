import {useThemedStyles} from '../src/ThemeContext';
import {useCallback,useState} from 'react';
import ChoiceSheet, {type Choice} from '../src/components/ChoiceSheet';
import ActionModal from '../src/components/ActionModal';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../src/api';
import {useAuth} from '../src/AuthContext';
import {colors} from '../src/theme';

type Sale={id:number;visita_id:number|null;situacao:string;numero_titulo:string;plano_versao_id:number;
  sigla_plano:string;data_venda:string;valor_cobrado:string;cliente_nome:string};
type Plan={id:number;codigo:string;duracao_meses:number};
type SaleList={vendas:Sale[];planos:Plan[];limitado:boolean};
const dateISO=(input:string):string|null=>{const m=input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCDate()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCFullYear()===+m[3]?m[3]+'-'+m[2]+'-'+m[1]:null;};
const dateBR=(d:Date)=>[String(d.getDate()).padStart(2,'0'),String(d.getMonth()+1).padStart(2,'0'),String(d.getFullYear())].join('/');
const money=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
export default function Vendas(){
  const router=useRouter();
  const s=useThemedStyles(lightStyles);
  const {token}=useAuth();
  const [sales,setSales]=useState<Sale[]>([]),[query,setQuery]=useState('');
  const [plans,setPlans]=useState<Plan[]>([]),[limited,setLimited]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(false),[planOpen,setPlanOpen]=useState(false);
  const [planId,setPlanId]=useState<number|null>(null),[start,setStart]=useState(''),[end,setEnd]=useState('');
  const [applied,setApplied]=useState({plan:null as number|null,start:'',end:''});
  const [filterError,setFilterError]=useState('');
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!token)return;
    try{
      const query=new URLSearchParams();
      if(applied.plan)query.set('plano',String(applied.plan));
      if(applied.start)query.set('inicio',applied.start);
      if(applied.end)query.set('fim',applied.end);
      const path='mobile/vendas'+(query.toString()?'?'+query.toString():'');
      const data=await apiRequest<SaleList>(path,{token});
      setSales(data.vendas);setPlans(data.planos);setLimited(data.limitado);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar vendas.');}
    finally{setLoading(false);setRefreshing(false);}
  },[token,applied]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  function applyFilters(){
    const a=start.trim()?dateISO(start.trim()):'';
    const b=end.trim()?dateISO(end.trim()):'';
    if(a===null||b===null){setFilterError('Confira as datas no formato DD/MM/AAAA.');return;}
    if(a&&b&&a>b){setFilterError('A data inicial deve ser anterior ou igual à final.');return;}
    setFilterError('');setApplied({plan:planId,start:a||'',end:b||''});setFiltersOpen(false);
  }
  function clearFilters(){setStart('');setEnd('');setPlanId(null);setFilterError('');setApplied({plan:null,start:'',end:''});}
  function quickDays(days:number){const today=new Date();const first=new Date(today);first.setDate(first.getDate()-days+1);setStart(dateBR(first));setEnd(dateBR(today));}
  const activeCount=Number(!!applied.plan)+Number(!!applied.start)+Number(!!applied.end);
  const selectedPlan=plans.find(p=>p.id===planId);
  const choices:Choice[]=plans.map(p=>({id:p.id,label:p.codigo+' · '+p.duracao_meses+' meses'}));
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
      <Pressable style={s.filterToggle} onPress={()=>setFiltersOpen(v=>!v)} accessibilityRole="button">
        <SymbolView name={{ios:'slider.horizontal.3',android:'tune'}} size={20} tintColor={colors.brandDark}/>
        <Text style={s.filterToggleText}>Filtrar por plano e período{activeCount?' · '+activeCount+' ativo(s)':''}</Text>
        <Text style={s.filterToggleArrow}>{filtersOpen?'⌃':'⌄'}</Text>
      </Pressable>
      {filtersOpen&&<View style={s.filters}>
        <Text style={s.filterTitle}>Refinar vendas</Text>
        <Pressable style={s.planPicker} onPress={()=>setPlanOpen(true)}>
          <Text style={s.filterLabel}>Plano</Text>
          <Text style={s.planValue}>{selectedPlan?selectedPlan.codigo+' · '+selectedPlan.duracao_meses+' meses':'Todos os planos'}</Text>
        </Pressable>
        <View style={s.dateRow}>
          <View style={s.dateField}><Text style={s.filterLabel}>Data inicial</Text>
            <TextInput style={s.dateInput} keyboardType="numbers-and-punctuation" value={start}
              placeholder="DD/MM/AAAA" placeholderTextColor="#8E8CA3" onChangeText={setStart}/></View>
          <View style={s.dateField}><Text style={s.filterLabel}>Data final</Text>
            <TextInput style={s.dateInput} keyboardType="numbers-and-punctuation" value={end}
              placeholder="DD/MM/AAAA" placeholderTextColor="#8E8CA3" onChangeText={setEnd}/></View>
        </View>
        <View style={s.dateRow}>{[7,30].map(days=><Pressable key={days} style={s.quick} onPress={()=>quickDays(days)}>
          <Text style={s.quickText}>Últimos {days} dias</Text></Pressable>)}</View>
        <View style={s.filterActions}><Pressable style={s.clear} onPress={clearFilters}>
          <Text style={s.clearText}>Limpar</Text></Pressable>
          <Pressable style={s.apply} onPress={applyFilters}>
            <Text style={s.applyText}>Aplicar filtros</Text></Pressable></View>
      </View>}
      {limited&&<Text style={s.limited}>Exibindo até 150 vendas. Restrinja as datas para localizar outras.</Text>}
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
    <ChoiceSheet open={planOpen} title="Escolha o plano" choices={choices} selected={planId} allowEmpty
      onChoose={setPlanId} onClose={()=>setPlanOpen(false)}/>
    <ActionModal visible={!!filterError} variant="warning" title="Confira os filtros"
      description={filterError} primaryLabel="Corrigir" secondaryLabel={null} onPrimary={()=>setFilterError('')}/>
  </SafeAreaView>;
}
const lightStyles = StyleSheet.create({
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
  filterToggle:{flexDirection:'row',gap:10,alignItems:'center',borderRadius:14,padding:15,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line},
  filterToggleText:{flex:1,fontSize:13,fontWeight:'900',color:colors.ink},
  filterToggleArrow:{fontSize:19,fontWeight:'900',color:colors.brandDark},
  filters:{backgroundColor:'#FFFFFF',borderRadius:18,padding:15,gap:12,borderWidth:1,borderColor:colors.line},
  filterTitle:{fontSize:15,color:colors.ink,fontWeight:'900'},
  filterLabel:{fontSize:11,fontWeight:'800',color:colors.muted},
  planPicker:{backgroundColor:'#F8F6FF',borderRadius:13,padding:13,gap:7},
  planValue:{color:colors.ink,fontWeight:'900',fontSize:13},
  dateRow:{flexDirection:'row',gap:9},
  dateField:{flex:1,gap:6},
  dateInput:{height:49,paddingHorizontal:10,backgroundColor:'#FAFAFF',borderWidth:1,borderColor:colors.line,borderRadius:12,color:colors.ink,fontSize:13},
  quick:{flex:1,alignItems:'center',backgroundColor:colors.pale,borderRadius:11,padding:10},
  quickText:{color:colors.brandDark,fontSize:11,fontWeight:'800'},
  filterActions:{flexDirection:'row',gap:10},
  clear:{flex:1,justifyContent:'center',alignItems:'center',padding:14,borderRadius:13,backgroundColor:colors.pale},
  clearText:{color:colors.brandDark,fontWeight:'900'},
  apply:{flex:2,justifyContent:'center',alignItems:'center',padding:14,borderRadius:13,backgroundColor:colors.brand},
  applyText:{color:'#FFFFFF',fontWeight:'900'},
  limited:{fontSize:11,color:colors.muted,lineHeight:17},
  error:{backgroundColor:'#FFF0E9',padding:13,borderRadius:13},
  errorText:{color:colors.danger,fontSize:12},
  empty:{backgroundColor:'#FFFFFF',borderRadius:21,padding:30,alignItems:'center',gap:9},
  emptyEmoji:{fontSize:34},emptyTitle:{fontSize:17,fontWeight:'900',color:colors.ink},
  emptyText:{color:colors.muted,fontSize:12,textAlign:'center',lineHeight:20},
});
