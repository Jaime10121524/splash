import {useCallback,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest,displayDate} from '../../src/api';
import {useAuth} from '../../src/AuthContext';
import {useTheme,useThemedStyles} from '../../src/ThemeContext';
import FinanceDatePicker from '../../src/components/FinanceDatePicker';
import ActionModal from '../../src/components/ActionModal';
import FeedbackPopup from '../../src/components/FeedbackPopup';
import {colors} from '../../src/theme';

type Detail={
  operacao:{id:number;visita_id:number|null;situacao:string;data_negociacao:string;
    data_venda:string|null;numero_titulo:string|null;sigla_plano:string;valor_cobrado:string;
    retorno_previsto:string|null;observacoes:string|null};
  recebido:string;saldo:string;fechamento?:{id:number;status:string}|null;
  movimentos?:{id:number;tipo:string;forma_nome:string;valor:string;data_movimento:string}[];
};
const localToday=()=>{
  const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')].join('-');
};
const money=(v:string|number|null|undefined)=>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));

export default function PendingDetail(){
  const s=useThemedStyles(lightStyles);
  const {palette}=useTheme();
  const {token}=useAuth();
  const params=useLocalSearchParams<{id:string}>();
  const id=Number(Array.isArray(params.id)?params.id[0]:params.id);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [clientName,setClientName]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [number,setNumber]=useState('');
  const [saleDate,setSaleDate]=useState(localToday);
  const [startDate,setStartDate]=useState(localToday);
  const [calendar,setCalendar]=useState<'sale'|'start'|null>(null);
  const [confirm,setConfirm]=useState(false);
  const load=useCallback(async()=>{
    if(!token||!Number.isSafeInteger(id)||id<1){
      setError('Negociação inválida.');setLoading(false);return;
    }
    try{
      const d=await apiRequest<Detail>('mobile/vendas/'+id,{token});
      setDetail(d);setError('');
      if(d.operacao.visita_id){
        try{
          const v=await apiRequest<{visita:{cliente_nome:string}}>('mobile/atendimentos/'+d.operacao.visita_id,{token});
          setClientName(v.visita.cliente_nome);
        }catch{/* Cadastro de cliente não exposto se o perfil não permite. */}
      }
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar a pendência.');}
    finally{setLoading(false);}
  },[id,token]);
  useFocusEffect(useCallback(()=>{setLoading(true);void load();},[load]));

  function askConvert(){
    if(detail?.operacao.situacao!=='PENDENCIA'||detail.fechamento){
      setError('Esta operação não pode ser convertida.');return;
    }
    if(!/^\d{4}$/.test(number)){
      setError('O número do título deve ter exatamente quatro dígitos.');return;
    }
    if(!saleDate||!startDate||saleDate<detail.operacao.data_negociacao){
      setError('A data da venda não pode ser anterior à negociação. Confira as datas.');return;
    }
    setError('');setConfirm(true);
  }
  async function convert(){
    if(!token||busy||!detail)return;
    setBusy(true);setConfirm(false);setError('');setNotice('');
    try{
      await apiRequest<{message:string}>('mobile/vendas/'+id+'/converter',{
        token,method:'POST',
        body:{numero_titulo:number,data_venda:saleDate,data_inicio:startDate},
      });
      router.replace({pathname:'/venda/[id]',params:{id:String(id)}});
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível fechar a pendência.');}
    finally{setBusy(false);}
  }

  const pending=detail?.operacao.situacao==='PENDENCIA';
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.heading}>
        <Pressable style={s.back} onPress={()=>router.back()} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} size={23} tintColor={palette.ink}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={s.kicker}>SPLASH / COMERCIAL</Text>
          <Text style={s.title}>Fechar pendência</Text>
        </View>
      </View>
      {loading?<ActivityIndicator color={palette.brand} size="large" style={{marginTop:40}}/>:null}
      {!!error&&<Pressable style={s.warning} onPress={()=>setError('')}>
        <Text style={s.warningText}>{error}</Text>
      </Pressable>}
      {!loading&&detail&&<>
        <View style={s.hero}>
          <Text style={s.heroLabel}>NEGOCIAÇÃO Nº {id}</Text>
          <Text style={s.heroTitle}>{clientName||'Negociação em andamento'}</Text>
          <Text style={s.heroTotal}>{money(detail.operacao.valor_cobrado)}</Text>
          <Text style={s.heroSub}>{detail.operacao.sigla_plano} · Iniciada em {displayDate(detail.operacao.data_negociacao)}</Text>
        </View>
        <View style={s.metrics}>
          <View style={s.metric}><Text style={s.metricLabel}>Já recebido</Text>
            <Text style={s.metricValue}>{money(detail.recebido)}</Text></View>
          <View style={s.metric}><Text style={s.metricLabel}>Saldo do cliente</Text>
            <Text style={s.metricValue}>{money(detail.saldo)}</Text></View>
        </View>
        {!!detail.operacao.retorno_previsto&&<Text style={s.note}>
          Retorno previsto: {displayDate(detail.operacao.retorno_previsto)}
        </Text>}
        {!!detail.operacao.observacoes&&<Text style={s.note}>{detail.operacao.observacoes}</Text>}
        {(detail.movimentos||[]).length>0&&<View style={s.card}>
          <Text style={s.sectionTitle}>Histórico de recebimentos</Text>
          {detail.movimentos?.map(r=><View key={r.id} style={s.receipt}>
            <Text style={s.receiptLabel}>{r.forma_nome} · {displayDate(r.data_movimento)}</Text>
            <Text style={s.receiptValue}>{r.tipo==='ENTRADA'?'+':'−'} {money(r.valor)}</Text>
          </View>)}
        </View>}
        {!pending?<View style={s.card}>
          <Text style={s.sectionTitle}>Negociação convertida</Text>
          <Text style={s.note}>Esta operação já é uma venda. O histórico foi preservado.</Text>
          <Pressable style={s.primary} onPress={()=>router.replace({pathname:'/venda/[id]',params:{id:String(id)}})}>
            <Text style={s.primaryText}>Abrir venda</Text>
          </Pressable>
        </View>:<>
          {Number(detail.saldo)>0&&!detail.fechamento&&<Pressable style={s.secondary}
            onPress={()=>router.push({pathname:'/venda/[id]',params:{id:String(id)}})}>
            <SymbolView name={{ios:'banknote',android:'payments'}} size={19} tintColor={palette.brandDark}/>
            <Text style={s.secondaryText}>Registrar recebimento nesta pendência</Text>
          </Pressable>}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Converter em venda</Text>
            <Text style={s.note}>A mesma negociação será transformada em venda, sem duplicar título nem perder os valores já recebidos.</Text>
            <Text style={s.label}>Número do título — quatro dígitos *</Text>
            <TextInput style={s.input} value={number}
              onChangeText={v=>setNumber(v.replace(/\D/g,'').slice(0,4))}
              keyboardType="number-pad" maxLength={4} placeholder="Ex.: 1567"
              placeholderTextColor={palette.muted}/>
            <Text style={s.label}>Data da venda *</Text>
            <Pressable style={s.dateButton} onPress={()=>setCalendar('sale')}>
              <Text style={s.dateValue}>{displayDate(saleDate)}</Text>
              <SymbolView name={{ios:'calendar',android:'event'}} size={19} tintColor={palette.brandDark}/>
            </Pressable>
            <Text style={s.label}>Início da vigência *</Text>
            <Pressable style={s.dateButton} onPress={()=>setCalendar('start')}>
              <Text style={s.dateValue}>{displayDate(startDate)}</Text>
              <SymbolView name={{ios:'calendar',android:'event'}} size={19} tintColor={palette.brandDark}/>
            </Pressable>
            <Pressable style={[s.primary,busy&&s.disabled]} disabled={busy||!!detail.fechamento}
              onPress={askConvert}>
              {busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={s.primaryText}>Confirmar venda</Text>}
            </Pressable>
            {!!detail.fechamento&&<Text style={s.warningText}>
              A operação está vinculada ao fechamento nº {detail.fechamento.id} e não pode ser alterada.
            </Text>}
          </View>
        </>}
      </>}
    </ScrollView>
    <FinanceDatePicker open={calendar!==null} value={calendar==='start'?startDate:saleDate}
      onClose={()=>setCalendar(null)}
      onChange={value=>{
        if(calendar==='start')setStartDate(value);
        else setSaleDate(value);
      }}/>
    <ActionModal visible={confirm} variant="confirm" title="Confirmar venda?"
      description={'Converter a pendência nº '+id+' no título '+number+
        '? Os valores já recebidos permanecerão vinculados à mesma operação.'}
      primaryLabel="Converter em venda" secondaryLabel="Voltar"
      busy={busy} onPrimary={()=>{void convert();}} onSecondary={()=>setConfirm(false)}/>
    <FeedbackPopup error={notice} onDismiss={()=>setNotice('')}/>
  </SafeAreaView>;
}

const lightStyles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:50,gap:13},
  heading:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:43,height:43,borderRadius:14,backgroundColor:'#FFFFFF',borderWidth:1,
    borderColor:colors.line,alignItems:'center',justifyContent:'center'},
  kicker:{fontSize:10,color:colors.brandDark,fontWeight:'900',letterSpacing:1},
  title:{fontSize:24,color:colors.ink,fontWeight:'900'},
  hero:{backgroundColor:colors.navy,borderRadius:21,padding:20,gap:9},
  heroLabel:{fontSize:10,color:'#D5C9FF',fontWeight:'900',letterSpacing:1},
  heroTitle:{fontSize:19,color:'#FFFFFF',fontWeight:'900'},
  heroTotal:{fontSize:29,color:'#FFFFFF',fontWeight:'900'},
  heroSub:{fontSize:11,color:'#E3DBFC'},
  metrics:{flexDirection:'row',gap:9},
  metric:{flex:1,backgroundColor:'#FFFFFF',borderRadius:16,borderWidth:1,
    borderColor:colors.line,padding:13,gap:7},
  metricLabel:{fontSize:11,color:colors.muted},
  metricValue:{fontSize:17,fontWeight:'900',color:colors.brandDark},
  note:{fontSize:12,lineHeight:19,color:colors.muted},
  card:{backgroundColor:'#FFFFFF',borderRadius:19,borderWidth:1,
    borderColor:colors.line,padding:17,gap:11},
  sectionTitle:{fontSize:17,color:colors.ink,fontWeight:'900'},
  receipt:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    borderTopWidth:1,borderTopColor:colors.line,paddingTop:9,gap:8},
  receiptLabel:{fontSize:12,color:colors.muted,flex:1},
  receiptValue:{fontSize:12,fontWeight:'900',color:colors.ink},
  label:{fontSize:11,color:colors.muted,fontWeight:'800',marginTop:4},
  input:{height:51,borderRadius:13,borderWidth:1,borderColor:colors.line,
    backgroundColor:'#FAFAFF',paddingHorizontal:13,color:colors.ink,fontSize:15},
  dateButton:{minHeight:52,borderRadius:13,borderWidth:1,borderColor:colors.line,
    backgroundColor:'#FAFAFF',paddingHorizontal:13,flexDirection:'row',
    alignItems:'center',justifyContent:'space-between'},
  dateValue:{fontSize:14,fontWeight:'900',color:colors.ink},
  primary:{minHeight:51,borderRadius:14,backgroundColor:colors.brand,
    alignItems:'center',justifyContent:'center',marginTop:9},
  primaryText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},
  secondary:{minHeight:54,borderRadius:15,backgroundColor:colors.pale,
    flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,padding:12},
  secondaryText:{color:colors.brandDark,fontSize:12,fontWeight:'900',flexShrink:1},
  warning:{backgroundColor:'#FFF0E9',borderRadius:13,padding:13},
  warningText:{color:colors.danger,fontSize:12,lineHeight:19},
  disabled:{opacity:.55},
});
