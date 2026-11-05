import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import DateRangeCalendar from '../src/components/DateRangeCalendar';
import {apiRequest} from '../src/api';
import {useAuth} from '../src/AuthContext';
import {useThemedStyles,useTheme} from '../src/ThemeContext';
import {colors} from '../src/theme';

type FinanceAccount={
  pessoa_id:number;nome:string;total:string;a_receber:string;recebidas:string;
  abatidas:string;liquidadas:string;participacoes:number;
};
type FinanceData={
  inicio:string;fim:string;admin:boolean;
  resumo:{a_pagar:string|null;a_receber:string;recebidas:string;pagas:string|null};
  contas:FinanceAccount[];possivel_truncamento:boolean;aviso:string;
};
function toIso(date:Date){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')].join('-');
}
const money=(value:string|null|undefined)=>
  value===null||value===undefined?'—':
    new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
function formatDate(value:string){
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?match[3]+'/'+match[2]+'/'+match[1]:value;
}
function initialPeriod(){
  const now=new Date();
  return {start:toIso(new Date(now.getFullYear(),now.getMonth(),1)),end:toIso(now)};
}
export default function FinanceiroMobile(){
  const {user,token}=useAuth();
  const {palette}=useTheme();
  const s=useThemedStyles(styles);
  const [period,setPeriod]=useState(initialPeriod);
  const [calendar,setCalendar]=useState(false);
  const [data,setData]=useState<FinanceData|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const inFlight=useRef(false);
  const load=useCallback(async()=>{
    if(!token||inFlight.current)return;
    inFlight.current=true;
    try{
      const query=new URLSearchParams({inicio:period.start,fim:period.end});
      const result=await apiRequest<FinanceData>('mobile/financeiro?'+query.toString(),{token});
      setData(result);setError('');
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível consultar o financeiro.');
    }finally{
      inFlight.current=false;setLoading(false);setRefreshing(false);
    }
  },[period.start,period.end,token]);
  useFocusEffect(useCallback(()=>{
    setLoading(true);
    void load();
  },[load]));
  const admin=user?.role==='admin';
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={palette.brand}
        onRefresh={()=>{setRefreshing(true);void load();}}/>}>
      <View style={s.header}>
        <Pressable style={s.back} onPress={()=>router.back()} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} tintColor={palette.ink} size={23}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={s.kicker}>SPLASH / FINANCEIRO</Text>
          <Text style={s.title}>{admin?'Comissões da equipe':'Meu financeiro'}</Text>
        </View>
      </View>
      <View style={s.hero}>
        <Text style={s.heroTitle}>{admin?'Controle financeiro':'Suas comissões'}</Text>
        <Text style={s.heroDescription}>{admin
          ?'Acompanhe os valores devidos à equipe e seus próprios recebimentos.'
          :'Consulte apenas seus direitos, pagamentos e abatimentos.'}</Text>
        <Pressable style={s.periodButton} onPress={()=>setCalendar(true)}>
          <SymbolView name={{ios:'calendar',android:'calendar_month'}} size={20} tintColor="#FFFFFF"/>
          <Text style={s.periodText}>{formatDate(period.start)} até {formatDate(period.end)}</Text>
          <Text style={s.periodEdit}>Alterar</Text>
        </Pressable>
      </View>
      {!!error&&<View style={s.errorCard}>
        <Text style={s.errorText}>{error}</Text>
        <Pressable onPress={()=>{void load();}}><Text style={s.retry}>Tentar novamente</Text></Pressable>
      </View>}
      {loading?<ActivityIndicator size="large" color={palette.brand} style={{marginTop:26}}/>:
      data&&<>
        <Text style={s.section}>Resumo das vendas do período</Text>
        <View style={s.grid}>
          {data.admin&&<View style={s.metric}>
            <Text style={s.metricName}>A pagar à equipe</Text>
            <Text style={s.metricNumber}>{money(data.resumo.a_pagar)}</Text>
            <Text style={s.metricHint}>Comissões pendentes de terceiros</Text>
          </View>}
          <View style={s.metric}>
            <Text style={s.metricName}>A receber</Text>
            <Text style={s.metricNumber}>{money(data.resumo.a_receber)}</Text>
            <Text style={s.metricHint}>Suas comissões pendentes</Text>
          </View>
          <View style={s.metric}>
            <Text style={s.metricName}>Recebidas</Text>
            <Text style={s.metricNumber}>{money(data.resumo.recebidas)}</Text>
            <Text style={s.metricHint}>Pagamentos em dinheiro ou transferência</Text>
          </View>
          {data.admin&&<View style={s.metric}>
            <Text style={s.metricName}>Já pagas à equipe</Text>
            <Text style={s.metricNumber}>{money(data.resumo.pagas)}</Text>
            <Text style={s.metricHint}>Inclui abatimentos registrados</Text>
          </View>}
        </View>
        <Text style={s.section}>{data.admin?'Por pessoa':'Minha conta'}</Text>
        {data.contas.length?data.contas.map(account=><View key={account.pessoa_id} style={s.account}>
          <View style={s.accountHeader}>
            <Text style={s.accountName}>{account.nome}</Text>
            <Text style={s.accountCount}>{account.participacoes} participações</Text>
          </View>
          <View style={s.line}><Text style={s.lineName}>Comissões apuradas</Text>
            <Text style={s.lineValue}>{money(account.total)}</Text></View>
          <View style={s.line}><Text style={s.lineName}>A receber</Text>
            <Text style={s.lineValue}>{money(account.a_receber)}</Text></View>
          <View style={s.line}><Text style={s.lineName}>Recebidas</Text>
            <Text style={s.lineValue}>{money(account.recebidas)}</Text></View>
          <View style={s.line}><Text style={s.lineName}>Abatimentos</Text>
            <Text style={s.lineValue}>{money(account.abatidas)}</Text></View>
        </View>):<View style={s.empty}><Text style={s.emptyTitle}>Sem comissões no período</Text>
          <Text style={s.emptyText}>Não existem direitos apurados nas vendas selecionadas.</Text></View>}
        {data.possivel_truncamento&&<View style={s.warning}>
          <Text style={s.warningText}>Há muitas vendas no período. Reduza o intervalo para consultar todos os resultados.</Text>
        </View>}
        <Text style={s.note}>{data.aviso}</Text>
      </>}
    </ScrollView>
    <DateRangeCalendar open={calendar} start={period.start} end={period.end}
      onClose={()=>setCalendar(false)}
      onConfirm={(start,end)=>{
        setPeriod({start,end});setCalendar(false);setLoading(true);
      }}/>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:60,gap:14},
  header:{flexDirection:'row',alignItems:'center',gap:12},
  back:{height:45,width:45,alignItems:'center',justifyContent:'center',
    borderRadius:14,backgroundColor:'#FFFFFF'},
  kicker:{fontSize:10,color:colors.brandDark,fontWeight:'900',letterSpacing:1},
  title:{fontSize:24,color:colors.ink,fontWeight:'900'},
  hero:{padding:20,backgroundColor:colors.navy,borderRadius:22,gap:9},
  heroTitle:{fontSize:20,color:'#FFFFFF',fontWeight:'900'},
  heroDescription:{fontSize:12,color:'#E1D9F8',lineHeight:19},
  periodButton:{marginTop:6,borderWidth:1,borderColor:'#7561A6',borderRadius:13,
    flexDirection:'row',alignItems:'center',padding:12,gap:10},
  periodText:{flex:1,fontWeight:'800',fontSize:12,color:'#FFFFFF'},
  periodEdit:{fontWeight:'900',fontSize:11,color:'#FFFFFF'},
  section:{color:colors.ink,fontSize:16,fontWeight:'900',marginTop:4},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  metric:{width:'48%',flexGrow:1,padding:16,backgroundColor:'#FFFFFF',
    borderWidth:1,borderColor:colors.line,borderRadius:18,gap:8},
  metricName:{color:colors.muted,fontSize:12,fontWeight:'800'},
  metricNumber:{color:colors.brandDark,fontSize:19,fontWeight:'900'},
  metricHint:{color:colors.muted,fontSize:10,lineHeight:15},
  account:{padding:16,borderRadius:18,backgroundColor:'#FFFFFF',gap:12,
    borderWidth:1,borderColor:colors.line},
  accountHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,
    borderBottomWidth:1,borderBottomColor:colors.line,paddingBottom:12},
  accountName:{flex:1,fontSize:15,fontWeight:'900',color:colors.ink},
  accountCount:{fontSize:10,color:colors.muted},
  line:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  lineName:{fontSize:12,color:colors.muted},
  lineValue:{fontWeight:'800',fontSize:13,color:colors.ink},
  errorCard:{backgroundColor:'#FFF0E9',borderRadius:12,padding:14,gap:9},
  errorText:{color:colors.danger,fontSize:12},
  retry:{color:colors.brandDark,fontWeight:'900',fontSize:12},
  empty:{backgroundColor:'#FFFFFF',borderRadius:18,padding:25,gap:8},
  emptyTitle:{fontWeight:'900',color:colors.ink,fontSize:15},
  emptyText:{fontSize:12,color:colors.muted},
  warning:{backgroundColor:'#FFF0E9',padding:14,borderRadius:12},
  warningText:{color:colors.danger,fontSize:12},
  note:{color:colors.muted,fontSize:11,lineHeight:18},
});
