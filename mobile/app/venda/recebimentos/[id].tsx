import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../../../src/api';
import {useAuth} from '../../../src/AuthContext';
import {useTheme} from '../../../src/ThemeContext';
import ChoiceSheet from '../../../src/components/ChoiceSheet';
import FinanceDatePicker from '../../../src/components/FinanceDatePicker';
import FeedbackPopup from '../../../src/components/FeedbackPopup';

type Movement={
  id:number;tipo:string;valor:string;forma_id:number;forma_nome:string;
  detentor:'CORRETOR'|'EMPRESA';data_movimento:string;
  referencia_entrada_id:number|null;
};
type Detail={
  editavel:boolean;
  operacao:{data_negociacao:string;numero_titulo:string|null};
  movimentos:Movement[];
};
type Method={id:number;nome:string;credito:boolean;codigo:string};
type Options={formas:Method[]};
const money=(value:string|number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
function valueToDecimal(value:string):string|null{
  const raw=value.trim().replace(/R\$|\s/g,'');
  const cleaned=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  if(!/^\d+(?:\.\d{1,2})?$/.test(cleaned)||Number(cleaned)<=0)return null;
  return Number(cleaned).toFixed(2);
}
function display(day:string){return /^\d{4}-\d\d-\d\d$/.test(day)
  ?day.slice(8,10)+'/'+day.slice(5,7)+'/'+day.slice(0,4):'Selecione a data';}

export default function CorrigirRecebimento(){
  const {id}=useLocalSearchParams<{id:string}>();
  const saleId=Number(id);
  const {token}=useAuth();
  const {palette}=useTheme();
  const [detail,setDetail]=useState<Detail|null>(null);
  const [forms,setForms]=useState<Method[]>([]);
  const [entryId,setEntryId]=useState<number|null>(null);
  const [formId,setFormId]=useState<number|null>(null);
  const [holder,setHolder]=useState<'CORRETOR'|'EMPRESA'>('CORRETOR');
  const [amount,setAmount]=useState('');
  const [day,setDay]=useState('');
  const [reason,setReason]=useState('');
  const [choosing,setChoosing]=useState(false);
  const [calendar,setCalendar]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const entries=useMemo(()=>{
    const movements=detail?.movimentos||[];
    const adjusted=new Set(movements.filter(x=>x.referencia_entrada_id!==null)
      .map(x=>x.referencia_entrada_id));
    return movements.filter(x=>x.tipo==='ENTRADA'&&!adjusted.has(x.id));
  },[detail]);
  const current=entries.find(e=>e.id===entryId);
  const method=forms.find(f=>f.id===formId);

  useEffect(()=>{
    if(!token||!Number.isSafeInteger(saleId)||saleId<1)return;
    let active=true;
    Promise.all([
      apiRequest<Detail>('mobile/vendas/'+saleId,{token}),
      apiRequest<Options>('mobile/vendas/opcoes',{token}),
    ]).then(([d,o])=>{
      if(!active)return;
      setDetail(d);setForms(o.formas);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível carregar recebimentos.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[saleId,token]);

  const choose=(entry:Movement)=>{
    setEntryId(entry.id);setFormId(entry.forma_id);
    setHolder(entry.detentor||'CORRETOR');setAmount(entry.valor);
    setDay(entry.data_movimento.slice(0,10));setReason('');
    setError('');
  };
  async function save(){
    if(!token||busy||!current)return;
    const value=valueToDecimal(amount);
    if(!formId||!value||!day||!reason.trim()||reason.trim().length<5){
      setError('Informe forma, valor, data e justificativa de pelo menos 5 caracteres.');return;
    }
    setBusy(true);setError('');
    try{
      await apiRequest('mobile/vendas/'+saleId+'/corrigir-recebimento',{
        method:'POST',token,body:{
          entrada_id:current.id,forma_id:formId,valor:value,
          data_movimento:day,detentor:method?.credito?'EMPRESA':holder,
          justificativa:reason.trim(),
        },
      });
      router.replace({pathname:'/venda/[id]',params:{
        id:String(saleId),notice:'Recebimento corrigido. Histórico financeiro e comissões atualizados.',
      }});
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível corrigir recebimento.');}
    finally{setBusy(false);}
  }
  const inputStyle=[styles.input,{backgroundColor:palette.surface,borderColor:palette.line,color:palette.ink}];
  return <SafeAreaView style={[styles.root,{backgroundColor:palette.background}]} edges={['top']}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={()=>router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'arrow_back'}} tintColor={palette.ink} size={24}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={[styles.title,{color:palette.ink}]}>Corrigir recebimento</Text>
          <Text style={{color:palette.muted}}>Venda {detail?.operacao.numero_titulo||saleId} · 1 de 2: escolher lançamento</Text>
        </View>
      </View>
      <Text style={{color:palette.muted,lineHeight:20}}>
        A correção registra um estorno técnico e um novo recebimento, sem excluir o histórico.
        Não é uma devolução de dinheiro. Operações fechadas ou com repasses pagos permanecem protegidas.
      </Text>
      {loading?<ActivityIndicator color={palette.brand} size="large"/>:
       detail?.editavel===false?<Text style={{color:palette.ink}}>
         Venda protegida. Consulte o fechamento para realizar ajustes compensatórios.
       </Text>:<>
        <Text style={[styles.section,{color:palette.ink}]}>1. Escolha o recebimento</Text>
        {entries.map(entry=><Pressable key={entry.id} onPress={()=>choose(entry)}
          style={[styles.entry,{borderColor:entry.id===entryId?palette.brand:palette.line,
            backgroundColor:entry.id===entryId?palette.pale:palette.surface}]}>
          <View style={{flex:1}}>
            <Text style={{color:palette.ink,fontWeight:'800'}}>{entry.forma_nome} · {money(entry.valor)}</Text>
            <Text style={{color:palette.muted,fontSize:12}}>{display(entry.data_movimento.slice(0,10))}
              {' · '}{entry.detentor==='EMPRESA'?'Valor com o clube':'Valor com o corretor'}</Text>
          </View>
          {entry.id===entryId&&<SymbolView name={{ios:'checkmark.circle.fill',android:'check_circle'}}
            tintColor={palette.brand} size={21}/>}
        </Pressable>)}
        {!entries.length&&<Text style={{color:palette.muted}}>Nenhum recebimento editável nesta venda.</Text>}
        {current&&<>
          <Text style={[styles.section,{color:palette.ink}]}>2. Informe os dados corrigidos</Text>
          <Pressable style={inputStyle} onPress={()=>setChoosing(true)}>
            <Text style={{color:palette.muted,fontSize:12}}>Forma de pagamento</Text>
            <View style={styles.fieldRow}><Text style={{color:palette.ink,fontWeight:'700',flex:1}}>
              {method?.nome||'Escolher forma'}</Text>
              <SymbolView name={{ios:'chevron.down',android:'expand_more'}} tintColor={palette.muted} size={16}/>
            </View>
          </Pressable>
          <View style={inputStyle}>
            <Text style={{color:palette.muted,fontSize:12}}>Valor recebido (R$)</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
              placeholder="0,00" placeholderTextColor={palette.muted} style={{color:palette.ink,fontSize:17}}/>
          </View>
          <Pressable style={inputStyle} onPress={()=>setCalendar(true)}>
            <Text style={{color:palette.muted,fontSize:12}}>Data do recebimento</Text>
            <Text style={{color:palette.ink,fontWeight:'700'}}>{display(day)}</Text>
          </Pressable>
          {!method?.credito&&<View style={styles.holders}>
            {(['CORRETOR','EMPRESA'] as const).map(type=><Pressable key={type}
              style={[styles.holder,{borderColor:type===holder?palette.brand:palette.line,
                backgroundColor:type===holder?palette.pale:palette.surface}]}
              onPress={()=>setHolder(type)}>
              <Text style={{color:palette.ink,fontWeight:'700'}}>{type==='CORRETOR'?'Com o corretor':'Com o clube'}</Text>
            </Pressable>)}
          </View>}
          <View style={inputStyle}>
            <Text style={{color:palette.muted,fontSize:12}}>Motivo da correção (obrigatório)</Text>
            <TextInput value={reason} onChangeText={setReason} multiline maxLength={500}
              placeholder="Ex.: pagamento lançado na forma incorreta"
              placeholderTextColor={palette.muted} style={{color:palette.ink,minHeight:55,textAlignVertical:'top'}}/>
          </View>
          <Pressable style={[styles.submit,{backgroundColor:palette.brand,opacity:busy?.6:1}]}
            disabled={busy} onPress={()=>{void save();}}>
            <Text style={styles.submitText}>{busy?'Salvando...':'Salvar correção e reapurar comissões'}</Text>
          </Pressable>
        </>}
       </>}
    </ScrollView>
    <ChoiceSheet open={choosing} title="Forma de pagamento"
      choices={forms.map(f=>({id:f.id,label:f.nome}))} selected={formId}
      onClose={()=>setChoosing(false)} onChoose={setFormId}/>
    <FinanceDatePicker open={calendar} value={day} title="Data do recebimento"
      onClose={()=>setCalendar(false)} onChange={setDay}/>
    <FeedbackPopup error={error} onDismiss={()=>setError('')}/>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1},container:{padding:18,paddingBottom:70,gap:13},
  header:{flexDirection:'row',alignItems:'center',gap:14,marginBottom:8},
  title:{fontSize:22,fontWeight:'900'},section:{fontSize:16,fontWeight:'900',marginTop:8},
  entry:{borderWidth:1,borderRadius:14,padding:16,flexDirection:'row',alignItems:'center',gap:10},
  input:{borderWidth:1,borderRadius:14,padding:14,gap:8,minHeight:55},
  fieldRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  holders:{flexDirection:'row',gap:10},holder:{flex:1,borderWidth:1,borderRadius:14,padding:12,alignItems:'center'},
  submit:{borderRadius:16,minHeight:53,alignItems:'center',justifyContent:'center',paddingHorizontal:12,marginTop:12},
  submitText:{color:'#FFFFFF',fontWeight:'900',textAlign:'center'},
});
