import {useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../../../src/api';
import {useAuth} from '../../../src/AuthContext';
import {useTheme} from '../../../src/ThemeContext';
import ChoiceSheet,{type Choice} from '../../../src/components/ChoiceSheet';
import FeedbackPopup from '../../../src/components/FeedbackPopup';
import {maskBRL,decimalToBRL,brlToCents} from '../../../src/moneyMask';

type Person={id:number;nome:string;papeis:string[]};
type Rateio={responsavel_pessoa_id:number;beneficiario_pessoa_id:number;papel:string;valor:string;observacoes:string};
type Rates={corretor_pessoa_id:number;comissao_bruta:string|null;editavel:boolean;aviso:string;
  rateios:(Rateio&{id:number;beneficiario_nome:string})[]};
const roles:Record<string,string>={ATENDENTE:'Atendente',GERENTE:'Gestor',CORRETOR:'Segundo corretor'};
const money=(v:string|null|undefined)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const cents=brlToCents;
export default function Participacoes(){
  const {id}=useLocalSearchParams<{id:string}>();
  const saleId=Number(id);
  const {token}=useAuth();
  const {palette}=useTheme();
  const [people,setPeople]=useState<Person[]>([]);
  const [rate,setRate]=useState<Rates|null>(null);
  const [rows,setRows]=useState<Rateio[]>([]);
  const [reason,setReason]=useState('');
  const [loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [choice,setChoice]=useState<{index:number;field:'beneficiario_pessoa_id'|'responsavel_pessoa_id'}|null>(null);
  useEffect(()=>{
    if(!token||!Number.isInteger(saleId)||saleId<1)return;
    let active=true;
    Promise.all([
      apiRequest<Rates>('mobile/vendas/'+saleId+'/rateios',{token}),
      apiRequest<{pessoas:Person[]}>('mobile/vendas/opcoes',{token}),
    ]).then(([r,options])=>{
      if(!active)return;
      setRate(r);setPeople(options.pessoas);
      setRows(r.rateios.map(p=>({
        responsavel_pessoa_id:Number(p.responsavel_pessoa_id),
        beneficiario_pessoa_id:Number(p.beneficiario_pessoa_id),
        papel:p.papel,valor:decimalToBRL(p.valor),observacoes:p.observacoes||'',
      })));
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível carregar participações.');})
      .finally(()=>{if(active)setLoaded(true);});
    return()=>{active=false;};
  },[token,saleId]);
  const change=(i:number,v:Partial<Rateio>)=>setRows(old=>old.map((r,index)=>index===i?{...r,...v}:r));
  const chosen=choice?rows[choice.index]?.[choice.field]??null:null;
  const names=(id:number)=>people.find(p=>p.id===id)?.nome||(id?'Pessoa '+id:'Selecionar');
  const options:Choice[]=choice?people.filter(p=>choice.field==='responsavel_pessoa_id'
    ?p.papeis.includes('corretor')
    :rows[choice.index]?.papel==='GERENTE'?p.papeis.includes('gerente')
    :rows[choice.index]?.papel==='CORRETOR'?p.papeis.includes('corretor')
    :p.papeis.includes('vendedor')||p.papeis.includes('corretor'))
    .map(p=>({id:p.id,label:p.nome})):[];
  const total=rows.reduce((n,p)=>n+(cents(p.valor)||0),0);
  const source=rate?.comissao_bruta?cents(rate.comissao_bruta):null;
  async function save(){
    if(!token||!rate?.editavel||saving)return;
    if(reason.trim().length<5){setError('Informe a justificativa do ajuste (mínimo de cinco caracteres).');return;}
    const items:Rateio[]=[];
    for(const r of rows){
      const centsValue=cents(r.valor);
      if(!r.responsavel_pessoa_id||!r.beneficiario_pessoa_id||!roles[r.papel]||!centsValue){
        setError('Informe função, responsável, beneficiário e valor de todas as participações.');return;
      }
      items.push({...r,valor:(centsValue/100).toFixed(2)});
    }
    setSaving(true);setError('');
    try{
      await apiRequest('mobile/vendas/'+saleId+'/rateios',{
        method:'POST',token,body:{itens:items,justificativa:reason.trim()},
      });
      router.replace({pathname:'/venda/[id]',params:{id:String(saleId),notice:'Participações atualizadas. O histórico financeiro foi registrado.'}});
    }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar participações.');}
    finally{setSaving(false);}
  }
  return <SafeAreaView style={[s.root,{backgroundColor:palette.background}]} edges={['top']}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.head}><Pressable onPress={()=>router.back()} style={s.back}>
        <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} size={24} tintColor={palette.ink}/></Pressable>
        <View style={{flex:1}}><Text style={[s.title,{color:palette.ink}]}>Comissões da venda</Text>
          <Text style={{color:palette.muted}}>Participações, funções e valores</Text></View>
      </View>
      {!loaded?<ActivityIndicator color={palette.brand} size="large"/>:rate?<>
        <View style={[s.summary,{backgroundColor:palette.surface,borderColor:palette.line}]}>
          <Text style={[s.label,{color:palette.muted}]}>Comissão bruta</Text>
          <Text style={[s.value,{color:palette.brandDark}]}>{money(rate.comissao_bruta)}</Text>
          <Text style={{color:palette.muted,fontSize:12}}>{rate.aviso}</Text>
        </View>
        {rows.map((r,i)=><View key={i} style={[s.card,{backgroundColor:palette.surface,borderColor:palette.line}]}>
          <View style={s.line}><Text style={[s.name,{color:palette.ink}]}>{names(r.beneficiario_pessoa_id)}</Text>
            <Text style={[s.value,{color:palette.brandDark}]}>{money(r.valor)}</Text></View>
          <Text style={{color:palette.muted,fontSize:12}}>{roles[r.papel]||r.papel}</Text>
          {rate.editavel&&<>
            <Text style={[s.label,{color:palette.muted}]}>Função</Text>
            <View style={s.roles}>{Object.keys(roles).map(role=><Pressable key={role}
              onPress={()=>change(i,{papel:role,beneficiario_pessoa_id:0})}
              style={[s.chip,{borderColor:palette.line,backgroundColor:r.papel===role?palette.pale:palette.surface}]}>
              <Text style={{fontSize:11,color:palette.brandDark,fontWeight:'800'}}>{roles[role]}</Text>
            </Pressable>)}</View>
            <Pressable style={[s.select,{borderColor:palette.line}]} onPress={()=>setChoice({index:i,field:'beneficiario_pessoa_id'})}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{color:palette.ink,flex:1}}>Beneficiário: {names(r.beneficiario_pessoa_id)}</Text><SymbolView name={{ios:'chevron.down',android:'expand_more'}} size={16} tintColor={palette.muted}/></View></Pressable>
            <Pressable style={[s.select,{borderColor:palette.line}]} onPress={()=>setChoice({index:i,field:'responsavel_pessoa_id'})}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{color:palette.ink,flex:1}}>Distribuído por: {names(r.responsavel_pessoa_id)}</Text><SymbolView name={{ios:'chevron.down',android:'expand_more'}} size={16} tintColor={palette.muted}/></View></Pressable>
            <TextInput style={[s.select,{color:palette.ink,borderColor:palette.line}]} value={r.valor}
              onChangeText={v=>change(i,{valor:maskBRL(v)})} keyboardType="number-pad"
              placeholder="R$ 0,00" placeholderTextColor={palette.muted}/>
            <Pressable onPress={()=>setRows(old=>old.filter((_,j)=>j!==i))}>
              <Text style={s.remove}>Remover esta participação</Text></Pressable>
          </>}
        </View>)}
        {rate.editavel&&<>
          <Pressable onPress={()=>setRows(old=>[...old,{
            responsavel_pessoa_id:rate.corretor_pessoa_id,
            beneficiario_pessoa_id:0,papel:'ATENDENTE',valor:'',observacoes:'',
          }])} style={[s.add,{borderColor:palette.brand}]}>
            <Text style={{color:palette.brandDark,fontWeight:'900'}}>+ Adicionar participação</Text></Pressable>
          {source!==null&&<Text style={{color:palette.muted,fontSize:12}}>
            Total distribuído: {money((total/100).toFixed(2))} · Comissão bruta: {money(rate.comissao_bruta)}</Text>}
          <TextInput style={[s.select,{borderColor:palette.line,color:palette.ink,minHeight:54}]}
            value={reason} onChangeText={setReason} placeholder="Motivo da alteração (obrigatório)"
            placeholderTextColor={palette.muted}/>
          <Pressable onPress={()=>{void save();}} disabled={saving}
            style={[s.submit,{backgroundColor:palette.brand}]}>
            <Text style={s.submitText}>{saving?'Salvando...':'Salvar participações'}</Text></Pressable>
        </>}
      </>:null}
    </ScrollView>
    <ChoiceSheet open={choice!==null} title="Selecionar participante" choices={options}
      selected={chosen} onClose={()=>setChoice(null)}
      onChoose={value=>{if(choice)change(choice.index,{[choice.field]:value||0});}}/>
    <FeedbackPopup error={error} onDismiss={()=>setError('')}/>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  root:{flex:1},content:{padding:18,paddingBottom:45,gap:15},
  head:{flexDirection:'row',alignItems:'center',gap:10},
  back:{width:40,height:42,alignItems:'center',justifyContent:'center'},
  title:{fontSize:21,fontWeight:'900'},
  summary:{padding:15,borderWidth:1,borderRadius:17,gap:8},
  label:{fontSize:11,fontWeight:'800'},
  value:{fontSize:16,fontWeight:'900'},
  card:{borderRadius:18,padding:15,borderWidth:1,gap:9},
  line:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  name:{fontWeight:'900',fontSize:14,flex:1},
  roles:{flexDirection:'row',gap:7,flexWrap:'wrap'},
  chip:{padding:8,borderWidth:1,borderRadius:10},
  select:{borderWidth:1,borderRadius:12,paddingHorizontal:12,paddingVertical:12},
  remove:{textAlign:'right',color:'#C45261',fontWeight:'800',fontSize:12},
  add:{padding:16,borderRadius:15,borderWidth:1,alignItems:'center'},
  submit:{minHeight:53,borderRadius:14,alignItems:'center',justifyContent:'center'},
  submitText:{fontSize:14,fontWeight:'900',color:'#FFFFFF'},
});
