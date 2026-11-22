import {useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../../../src/api';
import {useAuth} from '../../../src/AuthContext';
import {useTheme} from '../../../src/ThemeContext';
import ChoiceSheet,{type Choice} from '../../../src/components/ChoiceSheet';
import FinanceDatePicker from '../../../src/components/FinanceDatePicker';
import FeedbackPopup from '../../../src/components/FeedbackPopup';
import {colors} from '../../../src/theme';

type Person={id:number;nome:string;papeis:string[]};
type Plan={id:number;nome:string;valor:string};
type Options={planos:Plan[];pessoas:Person[];gerentes:{id:number;nome:string}[]};
type Operation={
  id:number;situacao:'VENDA'|'PENDENCIA';plano_versao_id:number;
  corretor_pessoa_id:number;segundo_corretor_pessoa_id:number|null;
  atendente_pessoa_id:number|null;atendente_adicional_pessoa_id:number|null;
  gerente_pessoa_id:number|null;desconto_corretor:string;numero_titulo:string|null;
  data_negociacao:string;data_venda:string|null;data_inicio:string|null;
  retorno_previsto:string|null;observacoes:string|null;
};
type Form={
  plano_versao_id:number|null;corretor_pessoa_id:number|null;
  segundo_corretor_pessoa_id:number|null;atendente_pessoa_id:number|null;
  atendente_adicional_pessoa_id:number|null;gerente_pessoa_id:number|null;
  desconto_corretor:string;numero_titulo:string;data_negociacao:string;
  data_venda:string;data_inicio:string;retorno_previsto:string;
  observacoes:string;justificativa:string;
};
type Field='plano_versao_id'|'corretor_pessoa_id'|'segundo_corretor_pessoa_id'|
  'atendente_pessoa_id'|'atendente_adicional_pessoa_id'|'gerente_pessoa_id';
const money=(n:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const display=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'Escolher data';
const cents=(raw:string)=>{const s=raw.trim().replace(/\s|R\$/g,'').replace(/\./g,'').replace(',','.');return /^\d+(?:\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100):null;};
const empty:Form={plano_versao_id:null,corretor_pessoa_id:null,segundo_corretor_pessoa_id:null,
  atendente_pessoa_id:null,atendente_adicional_pessoa_id:null,gerente_pessoa_id:null,
  desconto_corretor:'0.00',numero_titulo:'',data_negociacao:'',data_venda:'',data_inicio:'',
  retorno_previsto:'',observacoes:'',justificativa:''};
export default function EditSale(){
  const {id}=useLocalSearchParams<{id:string}>();
  const saleId=Number(id);
  const {token}=useAuth();
  const {palette}=useTheme();
  const [options,setOptions]=useState<Options|null>(null);
  const [kind,setKind]=useState<'VENDA'|'PENDENCIA'>('VENDA');
  const [form,setForm]=useState<Form>(empty);
  const [loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [choice,setChoice]=useState<Field|null>(null);
  const [dateField,setDateField]=useState<'data_negociacao'|'data_venda'|'data_inicio'|'retorno_previsto'|null>(null);
  useEffect(()=>{
    if(!token||!Number.isInteger(saleId)||saleId<1)return;
    let active=true;
    Promise.all([
      apiRequest<Options>('mobile/vendas/opcoes',{token}),
      apiRequest<{operacao:Operation;editavel:boolean}>('mobile/vendas/'+saleId,{token}),
    ]).then(([opts,details])=>{
      if(!active)return;
      if(details.editavel===false){setError('Venda protegida: alterações não disponíveis depois do fechamento ou repasse.');return;}
      const op=details.operacao;
      setOptions(opts);setKind(op.situacao);
      setForm({
        plano_versao_id:Number(op.plano_versao_id)||null,
        corretor_pessoa_id:Number(op.corretor_pessoa_id)||null,
        segundo_corretor_pessoa_id:op.segundo_corretor_pessoa_id===null?null:Number(op.segundo_corretor_pessoa_id),
        atendente_pessoa_id:op.atendente_pessoa_id===null?null:Number(op.atendente_pessoa_id),
        atendente_adicional_pessoa_id:op.atendente_adicional_pessoa_id===null?null:Number(op.atendente_adicional_pessoa_id),
        gerente_pessoa_id:op.gerente_pessoa_id===null?null:Number(op.gerente_pessoa_id),
        desconto_corretor:op.desconto_corretor||'0.00',numero_titulo:op.numero_titulo||'',
        data_negociacao:op.data_negociacao?.slice(0,10)||'',
        data_venda:op.data_venda?.slice(0,10)||'',
        data_inicio:op.data_inicio?.slice(0,10)||'',
        retorno_previsto:op.retorno_previsto?.slice(0,10)||'',
        observacoes:op.observacoes||'',justificativa:'',
      });
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível abrir a edição.');})
      .finally(()=>{if(active)setLoaded(true);});
    return()=>{active=false;};
  },[token,saleId]);
  const set=<K extends keyof Form>(key:K,value:Form[K])=>setForm(old=>({...old,[key]:value}));
  const choices:Choice[]=choice==='plano_versao_id'
    ?(options?.planos||[]).map(p=>({id:p.id,label:p.nome+' · '+money(p.valor)}))
    :choice==='gerente_pessoa_id'?(options?.gerentes||[]).map(p=>({id:p.id,label:p.nome}))
    :(options?.pessoas||[]).filter(p=>choice==='corretor_pessoa_id'||choice==='segundo_corretor_pessoa_id'
      ?p.papeis.includes('corretor'):p.papeis.some(r=>r==='corretor'||r==='vendedor'))
      .map(p=>({id:p.id,label:p.nome}));
  const chosen=choice?form[choice]:null;
  const name=(id:number|null)=>options?.pessoas.find(p=>p.id===id)?.nome||
    options?.gerentes.find(p=>p.id===id)?.nome||(id?'Pessoa '+id:'Nenhum');
  const selection=(field:Field,label:string)=>{
    const id=form[field],txt=field==='plano_versao_id'
      ?options?.planos.find(p=>p.id===id)?.nome||(id?'Plano '+id:'Selecionar plano')
      :name(id);
    return <Pressable style={[s.field,{borderColor:palette.line,backgroundColor:palette.surface}]} onPress={()=>setChoice(field)}>
      <Text style={[s.label,{color:palette.muted}]}>{label}</Text>
      <Text style={[s.value,{color:palette.ink}]}>{txt}  ⌄</Text>
    </Pressable>;
  };
  const date=(field:'data_negociacao'|'data_venda'|'data_inicio'|'retorno_previsto',label:string)=>
    <Pressable style={[s.field,{borderColor:palette.line,backgroundColor:palette.surface}]} onPress={()=>setDateField(field)}>
      <Text style={[s.label,{color:palette.muted}]}>{label}</Text>
      <Text style={[s.value,{color:palette.ink}]}>{display(form[field])}  📅</Text>
    </Pressable>;
  const input=(field:'desconto_corretor'|'numero_titulo'|'observacoes'|'justificativa',label:string,numeric=false)=>
    <View style={[s.field,{borderColor:palette.line,backgroundColor:palette.surface}]}>
      <Text style={[s.label,{color:palette.muted}]}>{label}</Text>
      <TextInput style={[s.value,{color:palette.ink,paddingVertical:0}]} value={form[field]}
        onChangeText={v=>set(field,numeric&&field==='numero_titulo'?v.replace(/\D/g,'').slice(0,4):v)}
        placeholder={label} placeholderTextColor={palette.muted}
        keyboardType={numeric?'decimal-pad':'default'}/>
    </View>;
  async function save(){
    if(saving||!token||!options||!Number.isInteger(saleId))return;
    const plan=options.planos.find(p=>p.id===form.plano_versao_id);
    const disc=cents(form.desconto_corretor);
    if(!form.plano_versao_id||!form.corretor_pessoa_id||!plan||disc===null||
      disc>=Math.round(Number(plan.valor)*100)||form.corretor_pessoa_id===form.segundo_corretor_pessoa_id){
      setError('Confira plano, corretores e desconto.');return;
    }
    if(form.atendente_pessoa_id && form.atendente_pessoa_id===form.atendente_adicional_pessoa_id){
      setError('Selecione atendentes diferentes.');return;
    }
    if(!form.data_negociacao||(kind==='VENDA'&&
      (!/^\d{4}$/.test(form.numero_titulo)||!form.data_venda||!form.data_inicio))||
      (form.retorno_previsto && form.retorno_previsto<form.data_negociacao)){
      setError('Confira o número do título e as datas.');return;
    }
    if(form.justificativa.trim().length<5){setError('Informe o motivo da correção com pelo menos 5 caracteres.');return;}
    setSaving(true);setError('');
    try{
      await apiRequest('mobile/vendas/'+saleId+'/editar',{method:'POST',token,body:{
        ...form,desconto_corretor:(disc/100).toFixed(2),
        data_venda:kind==='VENDA'?form.data_venda:null,
        data_inicio:kind==='VENDA'?form.data_inicio:null,
        numero_titulo:kind==='VENDA'?form.numero_titulo:null,
        retorno_previsto:form.retorno_previsto||null,
        justificativa:form.justificativa.trim(),
      }});
      router.replace({pathname:'/venda/[id]',params:{id:String(saleId),notice:'Venda atualizada. Comissão e responsáveis recalculados.'}});
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
    finally{setSaving(false);}
  }
  return <SafeAreaView style={[s.root,{backgroundColor:palette.background}]} edges={['top']}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.head}><Pressable style={s.back} onPress={()=>router.back()}>
        <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} tintColor={palette.ink} size={23}/></Pressable>
        <View style={{flex:1}}><Text style={[s.heading,{color:palette.ink}]}>Editar {kind==='VENDA'?'venda':'negociação'}</Text>
          <Text style={{color:palette.muted}}>Os campos são carregados com os valores atuais</Text></View>
      </View>
      {!loaded?<ActivityIndicator size="large" color={palette.brand}/>:
      options?<View style={s.stack}>
        {selection('plano_versao_id','Plano')}
        {selection('corretor_pessoa_id','Corretor principal')}
        {selection('segundo_corretor_pessoa_id','Segundo corretor')}
        {selection('atendente_pessoa_id','Atendente')}
        {selection('atendente_adicional_pessoa_id','Segundo atendente')}
        {selection('gerente_pessoa_id','Gestor comercial')}
        {input('desconto_corretor','Desconto (R$)',true)}
        {kind==='VENDA'&&input('numero_titulo','Número do título (4 dígitos)',true)}
        {date('data_negociacao','Data da negociação')}
        {kind==='VENDA'?<>
          {date('data_venda','Data da venda')}
          {date('data_inicio','Início da vigência')}
        </>:date('retorno_previsto','Retorno previsto')}
        {input('observacoes','Observações')}
        {input('justificativa','Motivo da alteração (obrigatório)')}
        <Text style={{color:palette.muted,fontSize:12,lineHeight:18}}>
          As comissões serão recalculadas pelo servidor; pagamentos já recebidos são preservados.
          Edição de participações individuais fica em outra tela.
        </Text>
        <Pressable style={[s.submit,{backgroundColor:palette.brand}]} disabled={saving} onPress={()=>{void save();}}>
          <Text style={s.submitText}>{saving?'Salvando...':'Salvar alterações'}</Text></Pressable>
      </View>:null}
    </ScrollView>
    <ChoiceSheet open={choice!==null} title="Selecione" selected={chosen} choices={choices}
      allowEmpty={choice!==null&&!['plano_versao_id','corretor_pessoa_id'].includes(choice)}
      onClose={()=>setChoice(null)} onChoose={id=>{if(choice)set(choice,id);}}/>
    <FinanceDatePicker open={dateField!==null} value={dateField?form[dateField]:''}
      title="Escolha a data" onClose={()=>setDateField(null)}
      onChange={value=>{if(dateField)set(dateField,value);}}/>
    <FeedbackPopup error={error} onDismiss={()=>setError('')}/>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  root:{flex:1},content:{padding:18,paddingBottom:50,gap:18},
  head:{flexDirection:'row',alignItems:'center',gap:12},
  heading:{fontSize:23,fontWeight:'900'},
  back:{width:44,height:44,alignItems:'center',justifyContent:'center'},
  stack:{gap:12},
  field:{borderWidth:1,borderRadius:15,paddingHorizontal:15,paddingVertical:12,gap:7,minHeight:59},
  label:{fontSize:11,fontWeight:'800'},
  value:{fontSize:14,fontWeight:'700',minHeight:22},
  submit:{minHeight:54,borderRadius:16,alignItems:'center',justifyContent:'center',marginTop:10},
  submitText:{fontSize:14,fontWeight:'900',color:'#FFFFFF'},
});
