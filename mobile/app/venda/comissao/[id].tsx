import {useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import {apiRequest} from '../../../src/api';
import {useAuth} from '../../../src/AuthContext';
import {useTheme} from '../../../src/ThemeContext';
import FeedbackPopup from '../../../src/components/FeedbackPopup';
import {maskBRL,decimalToBRL,brlToCents} from '../../../src/moneyMask';

export default function AjustarComissao(){
  const {id}=useLocalSearchParams<{id:string}>();
  const saleId=Number(id),{token}=useAuth(),{palette}=useTheme();
  const [value,setValue]=useState(''),[reason,setReason]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!token||!Number.isInteger(saleId)||saleId<1)return;
    let active=true;
    apiRequest<{comissoes:{bruta:string|null};fechamento?:{id:number}|null}>('mobile/vendas/'+saleId,{token})
      .then(data=>{if(active){if(data.fechamento)setError('Venda bloqueada por fechamento.');
        else setValue(decimalToBRL(data.comissoes.bruta||'0.00'));}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível abrir a venda.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[token,saleId]);
  async function save(){
    const n=brlToCents(value);
    if(n===null||reason.trim().length<5){setError('Informe valor válido e justificativa com pelo menos cinco caracteres.');return;}
    if(!token||busy)return;
    setBusy(true);setError('');
    try{
      await apiRequest('mobile/vendas/'+saleId+'/ajustar-comissao',{method:'POST',token,
        body:{valor:(n/100).toFixed(2),justificativa:reason.trim()}});
      router.replace({pathname:'/venda/[id]',params:{id:String(saleId),notice:'Comissão atualizada com auditoria.'}});
    }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar comissão.');}
    finally{setBusy(false);}
  }
  return <SafeAreaView style={{flex:1,backgroundColor:palette.background}} edges={['top']}>
    <ScrollView contentContainerStyle={s.body}>
      <Pressable onPress={()=>router.back()}><Text style={{color:palette.brandDark,fontWeight:'900'}}>‹ Voltar</Text></Pressable>
      <Text style={[s.title,{color:palette.ink}]}>Ajustar comissão bruta</Text>
      <Text style={{color:palette.muted,lineHeight:19}}>Altere o valor total antes de fazer os rateios individuais.
        A correção ficará registrada no histórico financeiro.</Text>
      {loading?<ActivityIndicator color={palette.brand}/>:
      <View style={s.content}>
        <Text style={{color:palette.muted,fontWeight:'800'}}>Comissão bruta (R$)</Text>
        <TextInput style={[s.input,{borderColor:palette.line,color:palette.ink,backgroundColor:palette.surface}]}
          value={value} onChangeText={v=>setValue(maskBRL(v))} keyboardType="number-pad" placeholder="R$ 0,00"
          placeholderTextColor={palette.muted}/>
        <Text style={{color:palette.muted,fontWeight:'800'}}>Justificativa obrigatória</Text>
        <TextInput style={[s.input,{borderColor:palette.line,color:palette.ink,backgroundColor:palette.surface}]}
          value={reason} onChangeText={setReason} placeholder="Por que a comissão está sendo ajustada?"
          placeholderTextColor={palette.muted}/>
        <Pressable style={[s.save,{backgroundColor:palette.brand}]} disabled={busy} onPress={()=>{void save();}}>
          <Text style={{color:'#FFFFFF',fontWeight:'900'}}>{busy?'Salvando...':'Salvar comissão'}</Text>
        </Pressable>
      </View>}
    </ScrollView>
    <FeedbackPopup error={error} onDismiss={()=>setError('')}/>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  body:{padding:18,paddingBottom:45,gap:14},title:{fontSize:23,fontWeight:'900'},
  content:{gap:12},input:{borderWidth:1,borderRadius:13,paddingHorizontal:13,minHeight:50,fontSize:15},
  save:{height:52,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:8},
});
