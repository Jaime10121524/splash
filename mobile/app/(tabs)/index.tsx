import {useProtectedPhoto} from '../../src/useProtectedPhoto';
import {useThemedStyles,useTheme} from '../../src/ThemeContext';
import {useCallback,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useRouter,useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SymbolView} from 'expo-symbols';
import {LinearGradient} from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {ApiError,Visit,apiRequest} from '../../src/api';
import {useAuth} from '../../src/AuthContext';
import VisitCard from '../../src/components/VisitCard';
import {colors,shadows} from '../../src/theme';

type Range=1|7|30;
type Data={
  periodo_dias:number;
  visitas:{total:number;aguardando:number;atendendo:number;venda:number;pendencia:number;
    retorno:number;sem_venda:number;canceladas:number;concluidos:number};
  vendas:{total:number;valor:string|null;serie:{data:string;quantidade:number}[]};
  taxa_conversao:number;
  recentes:Visit[];
  notificacoes:{nao_lidas:number;ultimas:{id:number;titulo:string;mensagem:string;categoria:string;rota:string;
    criado_em:string}[]};
};
const money=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const dmy=(d:string)=>{const m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]:d;};

function MiniKpi({title,value,description,icon,tint,onPress}:{
  title:string;value:string;description:string;icon:string;tint:string;onPress:()=>void
}){
  const s=useThemedStyles(lightStyles);const {palette}=useTheme();
  return <Pressable onPress={onPress} accessibilityRole="button" style={({pressed})=>[
    s.metric,pressed&&{transform:[{scale:.985}],opacity:.9}]}>
    <View style={[s.metricIcon,{backgroundColor:palette.pale}]}>
      <Text style={s.metricEmoji}>{icon}</Text>
    </View>
    <Text style={s.metricValue}>{value}</Text>
    <Text style={s.metricTitle}>{title}</Text>
    <Text style={s.metricSub}>{description}</Text>
    <View style={[s.accentLine,{backgroundColor:tint}]}/>
  </Pressable>;
}
function QuickAction({label,description,ios,android,onPress}:{
  label:string;description:string;ios:string;android:string;onPress:()=>void;
}){
  const s=useThemedStyles(lightStyles);const {palette}=useTheme();
  return <Pressable style={({pressed})=>[s.quick,pressed&&{opacity:.75}]}
    onPress={onPress} accessibilityRole="button">
    <View style={s.quickIcon}>
      <SymbolView name={{ios:ios as any,android:android as any}} size={21} tintColor={palette.brandDark}/>
    </View>
    <View style={{flex:1}}><Text style={s.quickTitle}>{label}</Text>
      <Text style={s.quickSubtitle}>{description}</Text></View>
    <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} size={17} tintColor={palette.muted}/>
  </Pressable>;
}
export default function HomeScreen(){
  const router=useRouter();const s=useThemedStyles(lightStyles);
  const {palette,isDark}=useTheme();const {user,token}=useAuth();
  const [days,setDays]=useState<Range>(7);
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState(''),[forbidden,setForbidden]=useState(false);
  const {uri:photoUri,reload:reloadPhoto}=useProtectedPhoto('mobile/me/foto',token);
  const load=useCallback(async()=>{
    if(!token)return;
    try{
      const result=await apiRequest<Data>('mobile/dashboard?dias='+days,{token});
      setData(result);setError('');setForbidden(false);
    }catch(e){
      if(e instanceof ApiError&&e.status===403)setForbidden(true);
      else setError(e instanceof Error?e.message:'Não foi possível carregar indicadores.');
    }finally{setLoading(false);setRefreshing(false);}
  },[token,days]);
  useFocusEffect(useCallback(()=>{
    void load();void reloadPhoto();
  },[load,reloadPhoto]));
  function go(path:'/atendimento/novo'|'/(tabs)/atendimentos'|'/(tabs)/agendamentos'|'/vendas'|'/clientes'|'/notificacoes'|'/perfil'){
    void Haptics.selectionAsync().catch(()=>{});
    router.push(path);
  }
  const firstName=user?.username?.split(/[.\s_-]/)[0]||'você';
  const today=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const series=useMemo(()=>{
    const all=data?.vendas.serie||[];
    const size=days===30?3:1;
    const grouped: {name:string;value:number}[]=[];
    for(let i=0;i<all.length;i+=size){
      const part=all.slice(i,i+size);
      grouped.push({name:dmy(part[0].data),value:part.reduce((n,p)=>n+p.quantidade,0)});
    }
    return grouped;
  },[data,days]);
  const maxCount=Math.max(1,...series.map(v=>v.value));
  const count=data?.visitas.concluidos||0;
  const conversion=Number(data?.taxa_conversao||0);
  const statuses=[
    {label:'Vendas fechadas',count:data?.visitas.venda||0,tint:'#8B73FF'},
    {label:'Em atendimento',count:data?.visitas.atendendo||0,tint:'#4AA2EB'},
    {label:'Aguardando',count:data?.visitas.aguardando||0,tint:'#E6A148'},
    {label:'Pendências',count:data?.visitas.pendencia||0,tint:'#EE7EA1'},
    {label:'Outros',count:(data?.visitas.sem_venda||0)+(data?.visitas.retorno||0)+(data?.visitas.canceladas||0),tint:'#8596B3'},
  ];
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}
        tintColor={palette.brand}/>}>
      <View style={s.header}>
        <View style={{flex:1}}>
          <Text style={s.eyebrow}>SPLASH NEXT · SEU PAINEL</Text>
          <Text style={s.greeting}>Olá, {firstName}! 👋</Text>
          <Text style={s.date}>{today}</Text>
        </View>
        <View style={s.headerActions}>
          <Pressable style={s.bell} onPress={()=>go('/notificacoes')}
            accessibilityRole="button" accessibilityLabel="Abrir notificações">
            <Text style={s.bellGlyph}>🔔</Text>
            {!!data?.notificacoes.nao_lidas&&<View style={s.badge}>
              <Text style={s.badgeText}>{data.notificacoes.nao_lidas>99?'99+':data.notificacoes.nao_lidas}</Text>
            </View>}
          </Pressable>
          <Pressable style={s.avatar} onPress={()=>go('/perfil')} accessibilityRole="button">
            {photoUri?<Image style={s.avatarImage} source={{uri:photoUri}}/>:
              <Text style={s.avatarText}>{firstName[0]?.toUpperCase()}</Text>}
          </Pressable>
        </View>
      </View>
      <LinearGradient colors={isDark?['#302663','#1D2944']:['#5845B9','#282456']}
        start={{x:0,y:0}} end={{x:1,y:1}} style={s.hero}>
        <View style={s.heroDecor}/>
        <Text style={s.heroKicker}>VISÃO COMERCIAL</Text>
        <Text style={s.heroTitle}>Seu desempenho,{'\n'}de perto.</Text>
        <Text style={s.heroDescription}>Visitas, vendas e oportunidades em um só lugar.</Text>
        <View style={s.periodTabs}>{([1,7,30] as Range[]).map(n=>
          <Pressable key={n} style={[s.periodTab,days===n&&s.periodSelected]}
            onPress={()=>{setLoading(true);setDays(n);}}>
            <Text style={[s.periodText,days===n&&s.periodSelectedText]}>
              {n===1?'Hoje':n===7?'7 dias':'30 dias'}</Text>
          </Pressable>)}</View>
      </LinearGradient>
      {loading?<ActivityIndicator style={{marginTop:45}} size="large" color={palette.brand}/>:
       forbidden?<View style={s.message}><Text style={s.messageText}>Seu perfil não tem acesso às métricas comerciais.</Text></View>:
       error?<View style={s.message}>
         <Text style={s.messageText}>{error}</Text>
         <Pressable style={s.retry} onPress={()=>{setLoading(true);void load();}}>
           <Text style={s.retryText}>Tentar novamente</Text></Pressable>
       </View>:data&&<>
         <View style={s.sectionRow}><Text style={s.sectionTitle}>Resumo do período</Text>
           <Text style={s.sectionHint}>{days===1?'Hoje':'Últimos '+days+' dias'}</Text></View>
         <View style={s.kpiGrid}>
           <MiniKpi title="Atendimentos" value={String(data.visitas.total)}
             description="Visitas registradas" icon="🎟️" tint="#5D98E6"
             onPress={()=>go('/(tabs)/atendimentos')}/>
           <MiniKpi title="Vendas fechadas" value={String(data.visitas.venda)}
             description="Resultados nas visitas" icon="🤝" tint="#8972FF"
             onPress={()=>go('/(tabs)/atendimentos')}/>
           <MiniKpi title="Títulos cadastrados" value={String(data.vendas.total)}
             description="Vendas lançadas" icon="🏆" tint="#E7A348"
             onPress={()=>go('/vendas')}/>
           <MiniKpi title="Conversão" value={conversion.toFixed(1).replace('.',',')+'%'}
             description={count+' atendimentos concluídos'} icon="📈" tint="#45BE92"
             onPress={()=>go('/(tabs)/atendimentos')}/>
         </View>
         {data.vendas.valor!==null&&<View style={s.revenue}>
           <View><Text style={s.revenueLabel}>VALOR DAS VENDAS DO PERÍODO</Text>
             <Text style={s.revenueValue}>{money(data.vendas.valor)}</Text></View>
           <Text style={s.revenueIcon}>💎</Text>
         </View>}
         <View style={s.chartCard}>
           <View style={s.sectionRow}><View><Text style={s.chartTitle}>Evolução de vendas</Text>
             <Text style={s.chartSubtitle}>Títulos cadastrados por dia{days===30?' (grupos de 3 dias)':''}</Text></View>
             <Text style={s.chartTotal}>{data.vendas.total}</Text></View>
           <View style={s.chartBars}>
             {series.map((item,index)=><View key={index} style={s.chartColumn}>
               <Text style={s.chartCount}>{item.value||''}</Text>
               <View style={s.chartTrack}>
                 <LinearGradient colors={['#AE9AFF','#7861F9']} style={[
                   s.chartBar,{height:item.value?Math.max(8,(item.value/maxCount)*88):2,opacity:item.value?1:.22}]}/>
               </View>
               {series.length<=10||index%3===0||index===series.length-1?
                 <Text style={s.chartDay}>{item.name}</Text>:<Text style={s.chartDay}> </Text>}
             </View>)}
           </View>
           {!data.vendas.total&&<Text style={s.zeroNote}>Nenhum título cadastrado neste período.</Text>}
         </View>
         <View style={s.chartCard}>
           <View style={s.sectionRow}><Text style={s.chartTitle}>Andamento das visitas</Text>
             <Pressable onPress={()=>go('/(tabs)/atendimentos')}><Text style={s.seeAll}>Ver tudo</Text></Pressable></View>
           <View style={s.progressBar}>{statuses.filter(x=>x.count>0).map(x=>
             <View key={x.label} style={{flex:x.count,backgroundColor:x.tint}}/>)}
             {!data.visitas.total&&<View style={{flex:1,backgroundColor:palette.line}}/>}
           </View>
           <View style={s.legend}>{statuses.map(x=><View key={x.label} style={s.legendItem}>
             <View style={[s.legendDot,{backgroundColor:x.tint}]}/>
             <Text style={s.legendLabel}>{x.label}</Text>
             <Text style={s.legendNumber}>{x.count}</Text>
           </View>)}</View>
         </View>
         <View style={s.sectionRow}><Text style={s.sectionTitle}>Acesso rápido</Text></View>
         <View style={s.quickCard}>
           <QuickAction label="Registrar chegada" description="Atendimento ou nova visita" ios="plus.circle.fill" android="add_circle"
             onPress={()=>go('/atendimento/novo')}/>
           <QuickAction label="Agendamentos" description="Consultar visitas marcadas" ios="calendar" android="event"
             onPress={()=>go('/(tabs)/agendamentos')}/>
           <QuickAction label="Vendas" description="Títulos, filtros e recebimentos" ios="bag.fill" android="shopping_bag"
             onPress={()=>go('/vendas')}/>
           <QuickAction label="Clientes" description="Carteira e contatos" ios="person.2.fill" android="contacts"
             onPress={()=>go('/clientes')}/>
         </View>
         {!!data.notificacoes.ultimas.length&&<>
           <View style={s.sectionRow}><Text style={s.sectionTitle}>Novidades para você</Text>
             <Pressable onPress={()=>go('/notificacoes')}><Text style={s.seeAll}>Abrir avisos</Text></Pressable></View>
           {data.notificacoes.ultimas.map(item=><Pressable key={item.id} style={s.notification}
             onPress={()=>go('/notificacoes')}>
             <Text style={s.notificationIcon}>{item.categoria.includes('VENDA')?'🎉':'🔔'}</Text>
             <View style={{flex:1}}><Text style={s.notificationTitle} numberOfLines={1}>{item.titulo}</Text>
               <Text style={s.notificationText} numberOfLines={2}>{item.mensagem}</Text></View>
             <Text style={s.notificationArrow}>›</Text>
           </Pressable>)}
         </>}
         <View style={s.sectionRow}><Text style={s.sectionTitle}>Atividade recente</Text>
           <Pressable onPress={()=>go('/(tabs)/atendimentos')}><Text style={s.seeAll}>Ver tudo</Text></Pressable></View>
         {data.recentes.length?data.recentes.map(visit=><VisitCard key={visit.id} visit={visit} compact
           onPress={()=>router.push({pathname:'/atendimento/[id]',params:{id:String(visit.id)}})}/>):
           <View style={s.message}><Text style={s.messageText}>Sem visitas nesse período.</Text></View>}
       </>}
       <View style={{height:24}}/>
    </ScrollView>
  </SafeAreaView>;
}

const lightStyles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{paddingHorizontal:17,paddingTop:15,paddingBottom:36,gap:12},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:9,marginBottom:6},
  eyebrow:{color:colors.brandDark,fontSize:10,fontWeight:'900',letterSpacing:1.2},
  greeting:{color:colors.ink,fontSize:25,fontWeight:'900',marginTop:5},
  date:{color:colors.muted,fontSize:12,marginTop:5},
  headerActions:{flexDirection:'row',alignItems:'center',gap:7},
  bell:{width:45,height:45,borderRadius:14,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.line},
  bellGlyph:{fontSize:22,lineHeight:30},
  badge:{backgroundColor:'#D9436F',borderRadius:12,minWidth:20,height:20,alignItems:'center',justifyContent:'center',
    position:'absolute',top:-5,right:-5,paddingHorizontal:4},
  badgeText:{fontSize:9,color:'#FFFFFF',fontWeight:'900'},
  avatar:{width:45,height:45,borderRadius:14,backgroundColor:colors.pale,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  avatarImage:{width:45,height:45},
  avatarText:{fontSize:20,fontWeight:'900',color:colors.brandDark},
  hero:{borderRadius:26,padding:20,paddingTop:21,overflow:'hidden',marginTop:7},
  heroDecor:{height:160,width:160,borderRadius:80,backgroundColor:'#8973EC',opacity:.17,position:'absolute',right:-53,top:-50},
  heroKicker:{color:'#E6DFFF',fontSize:10,fontWeight:'900',letterSpacing:1.3},
  heroTitle:{color:'#FFFFFF',fontSize:25,lineHeight:31,fontWeight:'900',marginTop:11},
  heroDescription:{color:'#E6DFFF',fontSize:12,lineHeight:19,marginTop:7},
  periodTabs:{flexDirection:'row',gap:7,marginTop:19},
  periodTab:{flex:1,paddingVertical:10,backgroundColor:'#403275',borderRadius:11,alignItems:'center'},
  periodSelected:{backgroundColor:'#FFFFFF'},
  periodText:{color:'#DED3FF',fontSize:12,fontWeight:'900'},
  periodSelectedText:{color:'#2A2251'},
  sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:10},
  sectionTitle:{fontSize:17,fontWeight:'900',color:colors.ink},
  sectionHint:{color:colors.muted,fontSize:11,fontWeight:'700'},
  kpiGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  metric:{width:'48%',flexGrow:1,backgroundColor:'#FFFFFF',borderRadius:19,padding:14,borderWidth:1,borderColor:colors.line,...shadows.card},
  metricIcon:{width:39,height:39,borderRadius:13,alignItems:'center',justifyContent:'center'},
  metricEmoji:{fontSize:22},
  metricValue:{fontSize:25,fontWeight:'900',color:colors.ink,marginTop:10},
  metricTitle:{fontSize:12,fontWeight:'900',color:colors.ink,marginTop:5},
  metricSub:{fontSize:10,color:colors.muted,marginTop:3},
  accentLine:{height:3,width:34,borderRadius:4,marginTop:11},
  revenue:{backgroundColor:colors.navy,borderRadius:17,padding:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  revenueLabel:{fontSize:10,color:'#E0D7FF',fontWeight:'900',letterSpacing:1},
  revenueValue:{fontSize:23,color:'#FFFFFF',fontWeight:'900',marginTop:7},
  revenueIcon:{fontSize:28},
  chartCard:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line,borderRadius:21,padding:17,gap:12},
  chartTitle:{fontSize:15,fontWeight:'900',color:colors.ink},
  chartSubtitle:{fontSize:10,color:colors.muted,marginTop:5},
  chartTotal:{fontSize:24,fontWeight:'900',color:colors.brandDark},
  chartBars:{height:150,flexDirection:'row',alignItems:'flex-end',gap:4,paddingTop:7},
  chartColumn:{flex:1,alignItems:'center',justifyContent:'flex-end',minWidth:0},
  chartCount:{fontSize:9,fontWeight:'900',color:colors.brandDark,height:15},
  chartTrack:{height:90,width:'65%',justifyContent:'flex-end'},
  chartBar:{width:'100%',borderTopLeftRadius:7,borderTopRightRadius:7},
  chartDay:{fontSize:8,marginTop:7,color:colors.muted,height:17,textAlign:'center'},
  zeroNote:{fontSize:11,color:colors.muted},
  progressBar:{height:12,borderRadius:9,overflow:'hidden',flexDirection:'row',backgroundColor:colors.line,marginTop:6},
  legend:{gap:10,marginTop:6},
  legendItem:{flexDirection:'row',alignItems:'center',gap:8},
  legendDot:{height:9,width:9,borderRadius:4},
  legendLabel:{color:colors.muted,fontSize:12,flex:1},
  legendNumber:{color:colors.ink,fontSize:13,fontWeight:'900'},
  quickCard:{backgroundColor:'#FFFFFF',borderRadius:20,paddingHorizontal:8},
  quick:{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:13,paddingHorizontal:7,
    borderBottomColor:colors.line,borderBottomWidth:1},
  quickIcon:{backgroundColor:colors.pale,width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},
  quickTitle:{fontSize:13,fontWeight:'900',color:colors.ink},
  quickSubtitle:{fontSize:11,color:colors.muted,marginTop:4},
  seeAll:{fontSize:11,fontWeight:'900',color:colors.brandDark},
  notification:{backgroundColor:'#FFFFFF',padding:13,borderRadius:16,flexDirection:'row',gap:11,alignItems:'center'},
  notificationIcon:{fontSize:20},
  notificationTitle:{fontSize:12,fontWeight:'900',color:colors.ink},
  notificationText:{fontSize:11,color:colors.muted,marginTop:3,lineHeight:17},
  notificationArrow:{fontSize:19,color:colors.brandDark},
  message:{padding:17,borderRadius:17,backgroundColor:'#FFFFFF',gap:13},
  messageText:{fontSize:12,color:colors.muted,lineHeight:18},
  retry:{backgroundColor:colors.pale,padding:12,borderRadius:12,alignSelf:'flex-start'},
  retryText:{fontSize:12,color:colors.brandDark,fontWeight:'900'},
});
