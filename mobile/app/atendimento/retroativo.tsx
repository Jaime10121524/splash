import {useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Keyboard,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import DateRangeCalendar from '../../src/components/DateRangeCalendar';
import ChoiceSheet from '../../src/components/ChoiceSheet';
import ActionModal from '../../src/components/ActionModal';
import FeedbackPopup from '../../src/components/FeedbackPopup';
import {useAuth} from '../../src/AuthContext';
import {apiRequest,MobileClient,MobileVisitOptions} from '../../src/api';
import {useTheme,useThemedStyles} from '../../src/ThemeContext';
import {colors} from '../../src/theme';

const toISO=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),
  String(d.getDate()).padStart(2,'0')].join('-');
const fmt=(s:string)=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);

export default function RetroactiveVisit(){
  const s=useThemedStyles(lightStyles),{palette}=useTheme();
  const {token,user}=useAuth();
  const authorized=!!user?.groups?.some(g=>g==='admin'||g==='gerente');
  const [opts,setOpts]=useState<MobileVisitOptions|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState(''),[clients,setClients]=useState<MobileClient[]>([]);
  const [selected,setSelected]=useState<MobileClient|null>(null);
  const [broker,setBroker]=useState<number|null>(null);
  const [second,setSecond]=useState<number|null>(null);
  const [attendant,setAttendant]=useState<number|null>(null);
  const [picker,setPicker]=useState<'broker'|'second'|'attendant'|null>(null);
  const [date,setDate]=useState(()=>{
    const d=new Date();d.setDate(d.getDate()-1);return toISO(d);
  });
  const [calendar,setCalendar]=useState(false);
  const [arrival,setArrival]=useState('09:00');
  const [start,setStart]=useState('09:15');
  const [finish,setFinish]=useState('10:00');
  const [status,setStatus]=useState<'VENDA'|'PENDENCIA'>('VENDA');
  const [notes,setNotes]=useState('');
  const [confirm,setConfirm]=useState(false);
  useEffect(()=>{
    if(!token||!authorized){setLoading(false);return;}
    let active=true;
    apiRequest<MobileVisitOptions>('mobile/atendimento-opcoes',{token})
      .then(data=>{if(active){setOpts(data);setBroker(data.minha_pessoa_id);}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Falha nas opções.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[token,authorized]);
  useEffect(()=>{
    if(!token||!authorized||selected||query.trim().length<2){setClients([]);return;}
    let active=true;
    const id=setTimeout(()=>{
      apiRequest<{clientes:MobileClient[]}>('mobile/clientes?q='+encodeURIComponent(query.trim()),{token})
        .then(d=>{if(active)setClients(d.clientes||[]);})
        .catch(e=>{if(active)setError(e instanceof Error?e.message:'Falha na pesquisa.');});
    },280);
    return ()=>{active=false;clearTimeout(id);};
  },[token,authorized,query,selected]);
  function validate(){
    if(!selected||!broker||!attendant||!date){
      setError('Selecione cliente, corretor, atendente e data.');return;
    }
    if(second===broker){setError('Segundo corretor deve ser diferente.');return;}
    const regex=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if(![arrival,start,finish].every(v=>regex.test(v))||!(arrival<=start&&start<finish)){
      setError('Informe horários reais na ordem: chegada, início e encerramento (HH:MM).');return;
    }
    const now=toISO(new Date());
    if(date>=now){setError('Para registro retroativo, selecione um dia anterior a hoje.');return;}
    setError('');setConfirm(true);
  }
  async function save(){
    if(!token||!selected||!broker||!attendant||busy)return;
    setConfirm(false);setBusy(true);setError('');
    try{
      const r=await apiRequest<{visita_id:number}>('mobile/atendimentos/retroativo',{
        token,method:'POST',body:{
          cliente_id:selected.id,corretor_pessoa_id:broker,
          segundo_corretor_pessoa_id:second,atendente_pessoa_id:attendant,
          data_visita:date,chegada_hora:arrival,inicio_hora:start,fim_hora:finish,
          status,observacoes:notes.trim(),
        },
      });
      router.replace({pathname:'/venda/[id]',params:{id:'novo',visita:String(r.visita_id)}});
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar atendimento retroativo.');}
    finally{setBusy(false);}
  }
  const options=picker==='attendant'?opts?.atendentes:opts?.corretores;
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Pressable onPress={()=>router.back()} style={s.back} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} tintColor={palette.ink} size={22}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={s.eyebrow}>HISTÓRICO COMERCIAL</Text>
          <Text style={s.heading}>Registrar visita anterior</Text>
        </View>
      </View>
      <View style={s.hero}>
        <Text style={s.heroTitle}>Venda de outra data</Text>
        <Text style={s.heroText}>Informe a data e os horários verdadeiros do atendimento.
          O registro terá histórico e ficará pronto para cadastrar título e pagamentos.</Text>
      </View>
      {!authorized&&<Text style={s.error}>Somente administrador ou gestor pode registrar atendimentos retroativos.</Text>}
      {authorized&&<>
        {loading?<ActivityIndicator color={palette.brand}/>:<>
          <View style={s.card}>
            <Text style={s.section}>01 · Cliente</Text>
            {selected?<Pressable onPress={()=>{setSelected(null);setQuery('');}} style={s.select}>
              <Text style={s.value}>{selected.nome}</Text>
              <Text style={s.hint}>Trocar cliente</Text>
            </Pressable>:<>
              <TextInput style={s.input} value={query} onChangeText={setQuery}
                placeholder="Pesquisar cliente já cadastrado" placeholderTextColor={palette.muted}/>
              {clients.map(x=><Pressable key={x.id} onPress={()=>{
                setSelected(x);setClients([]);Keyboard.dismiss();
              }} style={s.option}><Text style={s.value}>{x.nome}</Text></Pressable>)}
              <Text style={s.hint}>O cliente precisa estar cadastrado. Não é permitido duplicar uma visita existente na mesma data.</Text>
            </>}
          </View>
          <View style={s.card}>
            <Text style={s.section}>02 · Equipe</Text>
            {([
              {id:'broker',label:'Corretor principal',value:broker},
              {id:'second',label:'Segundo corretor',value:second},
              {id:'attendant',label:'Atendente',value:attendant},
            ] as const).map(x=><Pressable key={x.id} style={s.select}
              onPress={()=>setPicker(x.id)}>
              <Text style={s.label}>{x.label}</Text>
              <Text style={s.value}>{(x.id==='attendant'?opts?.atendentes:opts?.corretores)
                ?.find(v=>v.id===x.value)?.nome||'Selecionar'}</Text>
            </Pressable>)}
          </View>
          <View style={s.card}>
            <Text style={s.section}>03 · Data e horários</Text>
            <Pressable style={s.select} onPress={()=>setCalendar(true)}>
              <Text style={s.label}>Data da visita</Text>
              <Text style={s.value}>{fmt(date)}  📅</Text>
            </Pressable>
            <Text style={s.hint}>Informe horários reais no padrão HH:MM (24 horas).</Text>
            {([
              {label:'Chegada',value:arrival,set:setArrival},
              {label:'Início do atendimento',value:start,set:setStart},
              {label:'Encerramento',value:finish,set:setFinish},
            ] as const).map(x=><View key={x.label} style={s.timeRow}>
              <Text style={[s.label,{flex:1}]}>{x.label}</Text>
              <TextInput value={x.value} onChangeText={x.set} keyboardType="numbers-and-punctuation"
                style={[s.input,{width:106}]} maxLength={5} placeholder="HH:MM"/>
            </View>)}
          </View>
          <View style={s.card}>
            <Text style={s.section}>04 · Resultado</Text>
            <View style={s.actions}>
              {(['VENDA','PENDENCIA'] as const).map(x=><Pressable key={x}
                style={[s.choice,status===x&&s.choiceActive]} onPress={()=>setStatus(x)}>
                <Text style={[s.choiceLabel,status===x&&s.choiceLabelActive]}>
                  {x==='VENDA'?'Venda fechada':'Pendência'}</Text>
              </Pressable>)}
            </View>
            <TextInput multiline value={notes} onChangeText={setNotes} maxLength={3000}
              style={[s.input,{minHeight:76,textAlignVertical:'top'}]}
              placeholder="Observações (opcional)" placeholderTextColor={palette.muted}/>
          </View>
          <Pressable disabled={busy} style={s.primary} onPress={validate}>
            <Text style={s.primaryText}>{busy?'Registrando...':'Registrar e cadastrar a negociação'}</Text>
          </Pressable>
        </>}
      </>}
    </ScrollView>
    <ChoiceSheet open={picker!==null}
      title={picker==='broker'?'Corretor principal':picker==='second'?'Segundo corretor':'Atendente'}
      choices={(options||[]).filter(p=>picker!=='second'||p.id!==broker)
        .map(p=>({id:p.id,label:p.nome}))}
      selected={picker==='broker'?broker:picker==='second'?second:attendant}
      allowEmpty={picker==='second'} onChoose={value=>{
        if(picker==='broker'){setBroker(value);if(value===second)setSecond(null);}
        if(picker==='second')setSecond(value);
        if(picker==='attendant')setAttendant(value);
      }} onClose={()=>setPicker(null)}/>
    <DateRangeCalendar open={calendar} start={date} end={date}
      onClose={()=>setCalendar(false)} onConfirm={(a)=>{setDate(a);setCalendar(false);}}/>
    <ActionModal visible={confirm} variant="confirm" title="Registrar visita anterior?"
      description={'Salvar atendimento em '+fmt(date)+' com os horários informados, resultado '+
        (status==='VENDA'?'Venda fechada':'Pendência')+'?'}
      primaryLabel="Registrar atendimento" secondaryLabel="Revisar"
      onPrimary={()=>{void save();}} onSecondary={()=>setConfirm(false)} busy={busy}/>
    <FeedbackPopup error={error} onDismiss={()=>setError('')}/>
  </SafeAreaView>;
}
const lightStyles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:50,gap:13},
  header:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:43,height:43,backgroundColor:'#FFFFFF',borderRadius:13,alignItems:'center',justifyContent:'center'},
  eyebrow:{fontSize:10,color:colors.brandDark,fontWeight:'900',letterSpacing:1},
  heading:{fontSize:22,fontWeight:'900',color:colors.ink},
  hero:{backgroundColor:colors.navy,borderRadius:20,padding:19,gap:8},
  heroTitle:{fontWeight:'900',fontSize:20,color:'#FFFFFF'},
  heroText:{fontSize:12,color:'#E6DEFC',lineHeight:19},
  card:{backgroundColor:'#FFFFFF',borderColor:colors.line,borderWidth:1,borderRadius:16,padding:16,gap:12},
  section:{color:colors.ink,fontSize:16,fontWeight:'900'},
  label:{color:colors.muted,fontWeight:'800',fontSize:12},
  value:{color:colors.ink,fontWeight:'900',fontSize:13},
  select:{backgroundColor:colors.pale,borderRadius:12,padding:13,gap:6},
  input:{backgroundColor:colors.pale,borderWidth:1,borderColor:colors.line,
    borderRadius:12,padding:12,color:colors.ink,fontSize:13},
  option:{borderBottomWidth:1,borderBottomColor:colors.line,padding:12},
  hint:{fontSize:11,color:colors.muted,lineHeight:17},
  timeRow:{flexDirection:'row',alignItems:'center',gap:13},
  actions:{flexDirection:'row',gap:8},
  choice:{flex:1,backgroundColor:colors.pale,borderRadius:12,padding:14,alignItems:'center'},
  choiceActive:{backgroundColor:colors.brand},
  choiceLabel:{fontSize:12,fontWeight:'900',color:colors.brandDark},
  choiceLabelActive:{color:'#FFFFFF'},
  primary:{backgroundColor:colors.brand,minHeight:53,borderRadius:15,
    alignItems:'center',justifyContent:'center'},
  primaryText:{color:'#FFFFFF',fontWeight:'900',fontSize:14},
  error:{color:colors.danger,fontWeight:'800'},
});
