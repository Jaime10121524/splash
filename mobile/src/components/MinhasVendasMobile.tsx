import {useCallback,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {useAuth} from '../AuthContext';
import {apiRequest} from '../api';
import {useTheme,useThemedStyles} from '../ThemeContext';
import {colors} from '../theme';

type OwnSale={
  id:number;titulo:string;data_venda:string;cliente_quitou:boolean;
  comissao:{situacao:string;direito:string|null;recebido:string|null;
    abatido:string|null;pendente:string|null};
};
type OwnResult={vendas:OwnSale[];pagina:number;tem_mais:boolean;
  resumo_pagina:{a_receber:string;liquidado:string;a_apurar:number};aviso:string};
const money=(v:string|null|undefined)=>v===null||v===undefined?'A apurar':
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
const labels:Record<string,string>={
  QUITADA:'Quitada',PARCIAL:'Parcial',A_RECEBER:'A receber',
  A_APURAR:'A apurar',EM_APURACAO:'Em apuração',SEM_COMISSAO:'Sem comissão',
};

export default function MinhasVendasMobile(){
  const {token}=useAuth();
  const {palette}=useTheme();
  const s=useThemedStyles(styles);
  const [data,setData]=useState<OwnResult|null>(null);
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState('');
  const [applied,setApplied]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!token)return;
    try{
      const params=new URLSearchParams({pagina:String(page)});
      if(applied)params.set('q',applied);
      const result=await apiRequest<OwnResult>('mobile/minhas-vendas?'+params.toString(),{token});
      setData(result);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar suas comissões.');}
    finally{setLoading(false);setRefreshing(false);}
  },[token,page,applied]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={()=>{setRefreshing(true);void load();}} tintColor={palette.brand}/>}>
      <View style={s.heading}>
        <Pressable style={s.back} onPress={()=>router.back()} accessibilityRole="button"
          accessibilityLabel="Voltar"><Text style={s.backText}>‹</Text></Pressable>
        <View><Text style={s.kicker}>SPLASH / PESSOAL</Text><Text style={s.title}>Minhas comissões</Text></View>
      </View>
      <Text style={s.help}>Somente suas participações. Não são exibidos valores de vendas,
        dados pessoais dos clientes ou comissões de outras pessoas.</Text>
      <View style={s.searchRow}>
        <TextInput style={s.input} placeholder="Buscar número do título" value={search}
          placeholderTextColor={palette.muted} onChangeText={setSearch} onSubmitEditing={()=>{
            setPage(1);setApplied(search.trim());
          }} returnKeyType="search"/>
        <Pressable style={s.searchBtn} onPress={()=>{setPage(1);setApplied(search.trim());}}>
          <Text style={s.searchLabel}>Buscar</Text></Pressable>
      </View>
      {!!error&&<Text style={s.error}>{error}</Text>}
      {!!data&&<View style={s.totals}>
        <View style={s.totalItem}><Text style={s.totalTitle}>A receber nesta página</Text>
          <Text style={s.totalNumber}>{money(data.resumo_pagina.a_receber)}</Text></View>
        <View style={s.totalItem}><Text style={s.totalTitle}>Liquidado nesta página</Text>
          <Text style={s.totalNumber}>{money(data.resumo_pagina.liquidado)}</Text></View>
      </View>}
      {loading?<ActivityIndicator color={palette.brand} style={{marginTop:25}}/>:
        data?.vendas.length?data.vendas.map(sale=><View key={sale.id} style={s.card}>
          <View style={s.cardRow}><Text style={s.saleTitle}>{sale.titulo}</Text>
            <Text style={s.status}>{labels[sale.comissao.situacao]||sale.comissao.situacao}</Text></View>
          <Text style={s.date}>{sale.data_venda}</Text>
          <Text style={s.amount}>Comissão: {money(sale.comissao.direito)}</Text>
          <Text style={s.date}>Recebido: {money(sale.comissao.recebido)} · A receber: {money(sale.comissao.pendente)}</Text>
        </View>):<Text style={s.help}>Nenhuma participação encontrada neste filtro.</Text>}
      {!!data&&<View style={s.pages}>
        <Pressable style={s.pageBtn} disabled={page<=1||loading} onPress={()=>{setLoading(true);setPage(p=>p-1);}}>
          <Text style={s.pageLabel}>Anterior</Text></Pressable>
        <Text style={s.date}>Página {page}</Text>
        <Pressable style={s.pageBtn} disabled={!data.tem_mais||loading}
          onPress={()=>{setLoading(true);setPage(p=>p+1);}}>
          <Text style={s.pageLabel}>Próxima</Text></Pressable>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:45,gap:13},
  heading:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:43,height:43,borderRadius:13,backgroundColor:'#FFFFFF',
    alignItems:'center',justifyContent:'center'},
  backText:{fontSize:26,color:colors.ink},
  kicker:{fontSize:10,color:colors.brandDark,fontWeight:'900'},
  title:{fontSize:23,color:colors.ink,fontWeight:'900'},
  help:{fontSize:12,lineHeight:19,color:colors.muted},
  searchRow:{flexDirection:'row',gap:9},
  input:{flex:1,borderWidth:1,borderColor:colors.line,backgroundColor:'#FFFFFF',
    borderRadius:12,minHeight:48,paddingHorizontal:12,color:colors.ink},
  searchBtn:{borderRadius:12,backgroundColor:colors.brand,paddingHorizontal:16,
    alignItems:'center',justifyContent:'center'},
  searchLabel:{color:'#FFFFFF',fontWeight:'900'},
  totals:{flexDirection:'row',gap:10},
  totalItem:{flex:1,backgroundColor:'#FFFFFF',borderRadius:14,padding:12,gap:7,
    borderWidth:1,borderColor:colors.line},
  totalTitle:{fontSize:11,color:colors.muted},
  totalNumber:{fontWeight:'900',color:colors.brandDark,fontSize:17},
  card:{backgroundColor:'#FFFFFF',borderRadius:15,borderWidth:1,borderColor:colors.line,padding:15,gap:8},
  cardRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  saleTitle:{fontSize:14,fontWeight:'900',color:colors.ink,flex:1},
  status:{fontSize:11,fontWeight:'800',color:colors.brandDark},
  date:{fontSize:11,color:colors.muted},
  amount:{fontSize:14,color:colors.ink,fontWeight:'800'},
  pages:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  pageBtn:{backgroundColor:colors.pale,borderRadius:10,paddingVertical:11,paddingHorizontal:14},
  pageLabel:{color:colors.brandDark,fontSize:12,fontWeight:'900'},
  error:{color:colors.danger,fontSize:12},
});
