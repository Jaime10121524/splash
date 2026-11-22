import {useCallback,useEffect,useMemo,useState} from 'react';
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

type Person={id:number;nome:string;papeis:string[]};
type Options={pessoas:Person[]};
type Movement={
  id:number;tipo:'SAIDA'|'ESTORNO';referencia_adiantamento_id:number|null;
  origem:'CORRETOR'|'EMPRESA';beneficiario_pessoa_id:number;
  beneficiario_nome:string;valor:string;data_movimento:string;observacoes:string|null;
};
type Custody={
  situacao:'PENDENCIA'|'VENDA';saldos:{CORRETOR:string;EMPRESA:string};
  movimentos:Movement[];aviso:string;
};
const money=(n:string|number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
function toDecimal(value:string){
  const text=value.trim().replace(/R\$|\s/g,'');
  const normalized=text.includes(',')?text.replace(/\./g,'').replace(',','.'):text;
  return /^\d+(?:\.\d{1,2})?$/.test(normalized)&&Number(normalized)>0?Number(normalized).toFixed(2):null;
}
function today(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
const dayLabel=(d:string)=>/^\d{4}-\d\d-\d\d$/.test(d)?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):d;

export default function AdiantamentosPendencia(){
  const {id}=useLocalSearchParams<{id:string}>();
  const saleId=Number(id);
  const {token}=useAuth();
  const {palette}=useTheme();
  const [custody,setCustody]=useState<Custody|null>(null);
  const [people,setPeople]=useState<Person[]>([]);
  const [source,setSource]=useState<'CORRETOR'|'EMPRESA'>('CORRETOR');
  const [recipient,setRecipient]=useState<number|null>(null);
  const [amount,setAmount]=useState('');
  const [date,setDate]=useState(today());
  const [note,setNote]=useState('');
  const [selectOpen,setSelectOpen]=useState(false);
  const [calendarOpen,setCalendarOpen]=useState(false);
  const [reversing,setReversing]=useState<number|null>(null);
  const [reverseReason,setReverseReason]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[success,setSuccess]=useState('');
  const recipients=useMemo(()=>people.filter(p=>p.papeis.some(role=>role==='vendedor'||role==='gerente'))
    .map(p=>({id:p.id,label:p.nome+' · '+p.papeis.filter(r=>r==='vendedor'||r==='gerente').join('/')})),[people]);
  const refresh=useCallback(async()=>{
    if(!token)return;
    const data=await apiRequest<Custody>('mobile/vendas/'+saleId+'/custodia',{token});
    setCustody(data);
  },[token,saleId]);
  useEffect(()=>{
    if(!token||!saleId)return;
    let active=true;
    Promise.all([
      apiRequest<Custody>('mobile/vendas/'+saleId+'/custodia',{token}),
      apiRequest<Options>('mobile/vendas/opcoes',{token}),
    ]).then(([data,opts])=>{
      if(!active)return;
      setCustody(data);setPeople(opts.pessoas);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Falha ao carregar custódia.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[saleId,token]);

  async function register(){
    if(busy||!token)return;
    const value=toDecimal(amount);
    if(!recipient||!value||!note.trim()||!date){
      setError('Selecione destinatário, data, valor e justificativa.');return;
    }
    setBusy(true);setError('');
    try{
      await apiRequest('mobile/vendas/'+saleId+'/adiantamentos',{method:'POST',token,body:{
        origem:source,beneficiario_pessoa_id:recipient,valor:value,
        data_movimento:date,observacoes:note.trim(),
      }});
      await refresh();
      setAmount('');setRecipient(null);setNote('');
      setSuccess('Adiantamento registrado; ainda não é comissão paga.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar o adiantamento.');}
    finally{setBusy(false);}
  }
  async function reverse(){
    if(busy||!token||reversing===null)return;
    if(reverseReason.trim().length<5){setError('Informe motivo do estorno com 5 caracteres ou mais.');return;}
    setBusy(true);setError('');
    try{
      await apiRequest('mobile/vendas/'+saleId+'/adiantamentos/estornar',{method:'POST',token,body:{
        adiantamento_id:reversing,justificativa:reverseReason.trim(),
      }});
      setReversing(null);setReverseReason('');await refresh();
      setSuccess('Estorno registrado, mantendo os movimentos anteriores.');
    }catch(e){setError(e instanceof Error?e.message:'Falha ao estornar.');}
    finally{setBusy(false);}
  }
  const field=[styles.field,{borderColor:palette.line,backgroundColor:palette.surface}];
  const active=custody?.situacao==='PENDENCIA';
  const undone=new Set(custody?.movimentos.filter(m=>m.tipo==='ESTORNO').map(m=>m.referencia_adiantamento_id)||[]);
  return <SafeAreaView style={[styles.root,{backgroundColor:palette.background}]} edges={['top']}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={()=>router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'arrow_back'}} tintColor={palette.ink} size={24}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={[styles.heading,{color:palette.ink}]}>Custódia da pendência</Text>
          <Text style={{color:palette.muted}}>Negociação {saleId} · Saldos e antecipações</Text>
        </View>
      </View>
      {loading?<ActivityIndicator color={palette.brand} size="large"/>:custody&&<>
        <View style={[styles.card,{backgroundColor:palette.surface,borderColor:palette.line}]}>
          <Text style={[styles.section,{color:palette.ink}]}>Onde está o dinheiro?</Text>
          <View style={styles.balanceRow}>
            <View style={{flex:1}}><Text style={{color:palette.muted}}>Com o clube</Text>
              <Text style={[styles.value,{color:palette.ink}]}>{money(custody.saldos.EMPRESA)}</Text></View>
            <View style={{flex:1}}><Text style={{color:palette.muted}}>Com o corretor</Text>
              <Text style={[styles.value,{color:palette.ink}]}>{money(custody.saldos.CORRETOR)}</Text></View>
          </View>
          <Text style={{color:palette.muted,fontSize:12,lineHeight:18}}>{custody.aviso}</Text>
        </View>
        {active&&<>
          <Text style={[styles.section,{color:palette.ink}]}>Registrar adiantamento</Text>
          <Text style={{color:palette.muted,lineHeight:19}}>
            Informe quando parte do valor já recebido foi entregue antecipadamente ao vendedor ou gestor.
          </Text>
          <View style={styles.balanceRow}>
            {(['CORRETOR','EMPRESA'] as const).map(value=><Pressable key={value}
              style={[styles.choice,{backgroundColor:source===value?palette.pale:palette.surface,
                borderColor:source===value?palette.brand:palette.line}]} onPress={()=>setSource(value)}>
              <Text style={{color:palette.ink,fontWeight:'700'}}>{value==='CORRETOR'?'Saiu do corretor':'Saiu do clube'}</Text>
            </Pressable>)}
          </View>
          <Pressable style={field} onPress={()=>setSelectOpen(true)}>
            <Text style={{color:palette.muted,fontSize:12}}>Recebeu o adiantamento</Text>
            <View style={styles.balanceRow}>
              <Text style={{color:palette.ink,flex:1,fontWeight:'700'}}>{recipients.find(p=>p.id===recipient)?.label||'Selecionar vendedor ou gestor'}</Text>
              <SymbolView name={{ios:'chevron.down',android:'expand_more'}} size={16} tintColor={palette.muted}/>
            </View>
          </Pressable>
          <View style={field}><Text style={{color:palette.muted,fontSize:12}}>Valor antecipado (R$)</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
              placeholder="0,00" placeholderTextColor={palette.muted} style={{color:palette.ink,fontSize:16}}/>
          </View>
          <Pressable style={field} onPress={()=>setCalendarOpen(true)}>
            <Text style={{color:palette.muted,fontSize:12}}>Data do adiantamento</Text>
            <Text style={{color:palette.ink,fontWeight:'700'}}>{dayLabel(date)}</Text>
          </Pressable>
          <View style={field}><Text style={{color:palette.muted,fontSize:12}}>Justificativa</Text>
            <TextInput value={note} onChangeText={setNote} multiline maxLength={500}
              placeholder="Ex.: antecipação ao atendente antes do fechamento"
              placeholderTextColor={palette.muted}
              style={{color:palette.ink,minHeight:50,textAlignVertical:'top'}}/>
          </View>
          <Pressable style={[styles.submit,{backgroundColor:palette.brand,opacity:busy?0.6:1}]}
            disabled={busy} onPress={()=>{void register();}}>
            <Text style={styles.submitText}>{busy?'Salvando...':'Registrar adiantamento'}</Text>
          </Pressable>
        </>}
        <Text style={[styles.section,{color:palette.ink}]}>Histórico de antecipações</Text>
        {!custody.movimentos.length&&<Text style={{color:palette.muted}}>Nenhum adiantamento registrado.</Text>}
        {custody.movimentos.map(m=><View key={m.id} style={[styles.card,{borderColor:palette.line,backgroundColor:palette.surface}]}>
          <View style={styles.balanceRow}>
            <View style={{flex:1}}>
              <Text style={{fontWeight:'800',color:palette.ink}}>{m.beneficiario_nome}</Text>
              <Text style={{color:palette.muted,fontSize:12}}>{dayLabel(m.data_movimento)} · {m.origem==='EMPRESA'?'Clube':'Corretor'}
                {' · '}{m.tipo==='ESTORNO'?'ESTORNO':'ADIANTAMENTO'}</Text>
            </View>
            <Text style={[styles.value,{color:palette.ink}]}>{m.tipo==='ESTORNO'?'+':'−'}{money(m.valor)}</Text>
          </View>
          {!!m.observacoes&&<Text style={{color:palette.muted,fontSize:12}}>{m.observacoes}</Text>}
          {active&&m.tipo==='SAIDA'&&!undone.has(m.id)&&<Pressable
            onPress={()=>{setReversing(m.id);setReverseReason('');}}
            style={styles.reverse}><Text style={{color:palette.brandDark,fontWeight:'800'}}>Estornar adiantamento</Text></Pressable>}
          {reversing===m.id&&<View style={{gap:8}}>
            <TextInput style={[styles.field,{borderColor:palette.line,color:palette.ink}]}
              value={reverseReason} onChangeText={setReverseReason}
              placeholder="Motivo do estorno" placeholderTextColor={palette.muted}/>
            <View style={styles.balanceRow}>
              <Pressable onPress={()=>setReversing(null)} style={styles.reverse}>
                <Text style={{color:palette.ink}}>Cancelar</Text></Pressable>
              <Pressable onPress={()=>{void reverse();}} disabled={busy} style={styles.reverse}>
                <Text style={{color:palette.brandDark,fontWeight:'800'}}>Confirmar estorno</Text></Pressable>
            </View>
          </View>}
        </View>)}
      </>}
    </ScrollView>
    <ChoiceSheet open={selectOpen} title="Quem recebeu o adiantamento?"
      choices={recipients} selected={recipient} onChoose={setRecipient} onClose={()=>setSelectOpen(false)}/>
    <FinanceDatePicker open={calendarOpen} value={date} title="Data do adiantamento"
      onChange={setDate} onClose={()=>setCalendarOpen(false)}/>
    <FeedbackPopup error={error} success={success} onDismiss={()=>{setError('');setSuccess('');}}/>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1},container:{padding:18,paddingBottom:70,gap:12},
  header:{flexDirection:'row',alignItems:'center',gap:14,marginBottom:10},
  heading:{fontWeight:'900',fontSize:22},section:{fontWeight:'900',fontSize:16,marginTop:10},
  value:{fontSize:17,fontWeight:'900'},
  card:{borderWidth:1,borderRadius:16,padding:15,gap:10},
  balanceRow:{flexDirection:'row',alignItems:'center',gap:10},
  choice:{flex:1,borderWidth:1,borderRadius:13,padding:12,alignItems:'center'},
  field:{borderWidth:1,borderRadius:14,padding:14,gap:6},
  submit:{borderRadius:15,padding:16,alignItems:'center',marginTop:8},
  submitText:{color:'#FFFFFF',fontWeight:'900'},
  reverse:{paddingVertical:9,paddingHorizontal:12,alignSelf:'flex-start'},
});
