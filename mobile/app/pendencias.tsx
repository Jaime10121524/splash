import {useCallback,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {useAuth} from '../src/AuthContext';
import {apiRequest,displayDate} from '../src/api';
import {useTheme,useThemedStyles} from '../src/ThemeContext';
import {colors} from '../src/theme';

type Pending={
  id:number;cliente_nome:string;cliente_telefone:string|null;corretor_nome:string|null;
  chegada_em:string;fim_em:string|null;retorno_previsto:string|null;observacoes:string|null;
  possui_negociacao:boolean;operacao_id:number|null;pode_gerenciar:boolean;sem_atendimento?:boolean;
};
type Response={pendencias:Pending[];limitado:boolean};

export default function Pendencias(){
  const s=useThemedStyles(lightStyles);
  const {palette}=useTheme();
  const {token,user}=useAuth();
  const [rows,setRows]=useState<Pending[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'todas'|'sem_registro'|'registrada'>('todas');
  const [limited,setLimited]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!token)return;
    try{
      const response=await apiRequest<Response>('mobile/pendencias',{token});
      setRows(response.pendencias||[]);
      setLimited(!!response.limitado);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar pendências.');}
    finally{setLoading(false);setRefreshing(false);}
  },[token]);
  useFocusEffect(useCallback(()=>{setLoading(true);void load();},[load]));
  const shown=useMemo(()=>rows.filter(r=>
    (filter==='todas'||(filter==='registrada')===r.possui_negociacao)&&
    (!query.trim()||(r.cliente_nome+' '+r.id+' '+(r.corretor_nome||''))
      .toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))
  ),[rows,filter,query]);
  const open=(r:Pending)=>{
    if(!r.pode_gerenciar)return router.push({pathname:'/atendimento/[id]',params:{id:String(r.id)}});
    if(r.operacao_id)return router.push({pathname:'/pendencia/[id]',params:{
      id:String(r.operacao_id),cliente:r.cliente_nome,
    }} as never);
    if(r.possui_negociacao)return router.push({pathname:'/atendimento/[id]',params:{id:String(r.id)}});
    router.push({pathname:'/venda/[id]',params:{id:'novo',visita:String(r.id)}});
  };

  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{
        setRefreshing(true);void load();
      }} tintColor={palette.brand}/>}>
      <View style={s.header}>
        <Pressable style={s.back} onPress={()=>router.back()} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} size={22} tintColor={palette.ink}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={s.kicker}>COMERCIAL / SPLASH</Text>
          <Text style={s.title}>Pendências</Text>
        </View>
      </View>
      <View style={s.hero}>
        <Text style={s.heroLabel}>Oportunidades que ainda podem virar venda</Text>
        <Text style={s.heroCount}>{rows.length}</Text>
        <Text style={s.heroSub}>Consulte negociações de qualquer dia, registre valores recebidos e conclua a venda quando o cliente decidir.</Text>
      </View>
      <View style={s.search}>
        <SymbolView name={{ios:'magnifyingglass',android:'search'}} size={19} tintColor={palette.muted}/>
        <TextInput value={query} onChangeText={setQuery} placeholder="Cliente, corretor ou atendimento"
          placeholderTextColor={palette.muted} style={s.searchInput}/>
      </View>
      <View style={s.filters}>
        {([
          {id:'todas',label:'Todas'},
          {id:'sem_registro',label:'Sem negociação'},
          {id:'registrada',label:'Registradas'},
        ] as const).map(item=><Pressable key={item.id} onPress={()=>setFilter(item.id)}
          style={[s.filter,filter===item.id&&s.filterSelected]}>
          <Text style={[s.filterText,filter===item.id&&s.filterTextSelected]}>{item.label}</Text>
        </Pressable>)}
      </View>
      {limited&&<Text style={s.hint}>Exibindo as 150 pendências mais recentes. As anteriores continuam no sistema web.</Text>}
      {!!error&&<Pressable style={s.warning} onPress={()=>{void load();}}>
        <Text style={s.warningText}>{error} Toque para tentar novamente.</Text>
      </Pressable>}
      {loading?<ActivityIndicator size="large" color={palette.brand} style={{marginTop:30}}/>:
        shown.length?shown.map(r=><Pressable key={r.id} style={s.card} onPress={()=>open(r)}>
          <View style={s.cardTop}>
            <View style={s.badge}><Text style={s.badgeText}>
              {r.possui_negociacao?'NEGOCIAÇÃO REGISTRADA':'AGUARDANDO REGISTRO'}
            </Text></View>
            <SymbolView name={{ios:'chevron.right',android:'chevron_right'}} size={19} tintColor={palette.brandDark}/>
          </View>
          <Text style={s.name}>{r.cliente_nome}</Text>
          <Text style={s.meta}>{r.sem_atendimento?'Negociação direta':'Atendimento nº '+r.id} · {displayDate(r.chegada_em)}</Text>
          {!!r.corretor_nome&&<Text style={s.meta}>Corretor: {r.corretor_nome}</Text>}
          {!!r.retorno_previsto&&<Text style={s.meta}>Retorno previsto: {displayDate(r.retorno_previsto)}</Text>}
          <View style={s.cardBottom}><Text style={s.action}>
            {!r.pode_gerenciar?'Consultar atendimento':r.operacao_id?'Ver valores e fechar venda':
              r.possui_negociacao?'Consultar atendimento':'Cadastrar negociação'}
          </Text></View>
        </Pressable>):<View style={s.empty}>
          <Text style={s.emptyTitle}>Nenhuma pendência localizada</Text>
          <Text style={s.emptyText}>Confira o filtro ou volte para Atendimentos e registre uma negociação.</Text>
        </View>}
      {user?.role==='operador'&&<Text style={s.hint}>
        Seu perfil consulta atendimentos. A criação e conversão de negociações exige autorização comercial.
      </Text>}
    </ScrollView>
  </SafeAreaView>;
}

const lightStyles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:55,gap:13},
  header:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:44,height:44,borderRadius:14,backgroundColor:'#FFFFFF',
    borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},
  kicker:{color:colors.brandDark,fontWeight:'900',fontSize:10,letterSpacing:1.1},
  title:{color:colors.ink,fontWeight:'900',fontSize:25},
  hero:{backgroundColor:colors.navy,borderRadius:23,padding:20,gap:7},
  heroLabel:{color:'#DCD6FF',fontSize:12,fontWeight:'800'},
  heroCount:{color:'#FFFFFF',fontWeight:'900',fontSize:33},
  heroSub:{color:'#E9E1FF',fontSize:12,lineHeight:19},
  search:{backgroundColor:'#FFFFFF',borderRadius:15,borderWidth:1,borderColor:colors.line,
    flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:13},
  searchInput:{flex:1,minHeight:50,color:colors.ink,fontSize:13},
  filters:{flexDirection:'row',gap:7},
  filter:{flex:1,alignItems:'center',justifyContent:'center',borderRadius:11,
    paddingVertical:11,backgroundColor:colors.pale},
  filterSelected:{backgroundColor:colors.brand},
  filterText:{color:colors.brandDark,fontWeight:'900',fontSize:10,textAlign:'center'},
  filterTextSelected:{color:'#FFFFFF'},
  hint:{color:colors.muted,fontSize:11,lineHeight:18},
  warning:{backgroundColor:'#FFF0E9',borderRadius:13,padding:14},
  warningText:{fontSize:12,color:colors.danger},
  card:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line,
    borderRadius:19,padding:17,gap:8},
  cardTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  badge:{backgroundColor:colors.pale,borderRadius:9,paddingHorizontal:9,paddingVertical:6},
  badgeText:{color:colors.brandDark,fontWeight:'900',fontSize:9,letterSpacing:.3},
  name:{fontSize:16,fontWeight:'900',color:colors.ink},
  meta:{fontSize:12,color:colors.muted,lineHeight:18},
  cardBottom:{borderTopWidth:1,borderTopColor:colors.line,paddingTop:11,marginTop:2},
  action:{color:colors.brandDark,fontWeight:'900',fontSize:12},
  empty:{backgroundColor:'#FFFFFF',borderRadius:18,padding:28,gap:9},
  emptyTitle:{fontSize:17,color:colors.ink,fontWeight:'900'},
  emptyText:{fontSize:12,color:colors.muted,lineHeight:19},
});
