import FeedbackPopup from '../../src/components/FeedbackPopup';
import {useThemedStyles} from '../../src/ThemeContext';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { apiRequest, MobileClient, MobileVisitOptions } from '../../src/api';
import { maskPhoneBR, editMaskedPhoneBR, phoneDigits } from '../../src/phone';
import { useAuth } from '../../src/AuthContext';
import ChoiceSheet from '../../src/components/ChoiceSheet';
import ClientPickerModal from '../../src/components/ClientPickerModal';
import ActionModal from '../../src/components/ActionModal';
import { colors } from '../../src/theme';

type ClientRecord = {
  id:number; nome:string; telefone:string; cpf:string|null; email:string|null;
  data_nascimento:string|null; endereco:string|null; profissao:string|null;
  observacoes:string|null; origem_id:number|null; indicador_cliente_id:number|null;
  indicador_nome:string|null; dono_corrente_pessoa_id:number|null; ativo:boolean;
};
function dateBR(d:string|null){if(!d)return '';const p=d.split('-');return p.length===3?p.reverse().join('/'):d;}
function isoDate(d:string){
  if(!d.trim())return null;
  const p=d.split('/'); if(p.length!==3)return '';
  const y=Number(p[2]),m=Number(p[1]),day=Number(p[0]);
  const dt=new Date(Date.UTC(y,m-1,day));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===day
    ?p[2]+'-'+p[1]+'-'+p[0]:'';
}
const money=(value:string)=>{
  const s=value.trim().replace(/\./g,'').replace(',','.');
  return /^\d+(?:\.\d{1,2})?$/.test(s)?s:null;
};

export default function ClientEditor() {
  const styles=useThemedStyles(lightStyles);
  const {id:rawId,vendaVisita:rawVisit}=useLocalSearchParams<{id:string;vendaVisita?:string}>();
  const saleVisitId=Number(Array.isArray(rawVisit)?rawVisit[0]:rawVisit);
  const continueToSale=Number.isSafeInteger(saleVisitId)&&saleVisitId>0;
  const id=Array.isArray(rawId)?rawId[0]:rawId;
  const isNew=id==='novo';
  const parsed=Number(id);
  const {token,user}=useAuth();
  const admin=!!user?.groups?.includes('admin');
  const [options,setOptions]=useState<MobileVisitOptions|null>(null);
  const [old,setOld]=useState<ClientRecord|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [picker,setPicker]=useState<'origin'|'owner'|null>(null);
  const [indicatorOpen,setIndicatorOpen]=useState(false);
  const [indicator,setIndicator]=useState<MobileClient|null>(null);
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [cpf,setCpf]=useState('');
  const [email,setEmail]=useState('');
  const [birthday,setBirthday]=useState('');
  const [occupation,setOccupation]=useState('');
  const [address,setAddress]=useState('');
  const [notes,setNotes]=useState('');
  const [origin,setOrigin]=useState<number|null>(null);
  const [owner,setOwner]=useState<number|null>(null);
  const [reason,setReason]=useState('');
  const [bonus,setBonus]=useState(false);
  const [bonusPaid,setBonusPaid]=useState(false);
  const [bonusValue,setBonusValue]=useState('');

  useEffect(()=>{
    if(!token)return;
    let active=true;
    setLoading(true);
    const requests=[
      apiRequest<MobileVisitOptions>('mobile/atendimento-opcoes',{token}),
      ...(isNew?[]:[apiRequest<{cliente:ClientRecord}>('mobile/clientes/'+id,{token})]),
    ];
    Promise.all(requests).then(results=>{
      if(!active)return;
      const opts=results[0] as MobileVisitOptions;
      setOptions(opts);
      setOwner(opts.minha_pessoa_id);
      if(!isNew){
        const c=(results[1] as {cliente:ClientRecord}).cliente;
        setOld(c);setName(c.nome);setPhone(maskPhoneBR(c.telefone));setCpf(c.cpf||'');
        setEmail(c.email||'');setBirthday(dateBR(c.data_nascimento));
        setOccupation(c.profissao||'');setAddress(c.endereco||'');
        setNotes(c.observacoes||'');setOrigin(c.origem_id);setOwner(c.dono_corrente_pessoa_id);
        if(c.indicador_cliente_id){
          setIndicator({id:c.indicador_cliente_id,nome:c.indicador_nome||'Cliente indicador',telefone:null});
        }
      }
      setError('');
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Erro ao carregar cliente.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[token,id,isNew]);

  const selectedOrigin=options?.origens.find(o=>o.id===origin);
  const assignedOwner=options?.minha_pessoa_id??owner;
  const ownerName=options?.corretores.find(p=>p.id===assignedOwner)?.nome||'';
  const editingOwner=old&&old.dono_corrente_pessoa_id!==assignedOwner&&!indicator;

  async function save(){
    if(saving||!token)return;
    if(!name.trim()||![10,11].includes(phoneDigits(phone).length)||!origin||
      !assignedOwner && !indicator){
      setError('Informe nome, telefone com DDD, origem e responsável.');return;
    }
    if(birthday.trim() && !isoDate(birthday)){
      setError('Data de nascimento inválida. Use DD/MM/AAAA.');return;
    }
    if(bonus&&isNew&&(!indicator||!money(bonusValue)||Number(money(bonusValue))<=0)){
      setError('Selecione o indicador e informe o valor da bonificação.');return;
    }
    Keyboard.dismiss();setSaving(true);setError('');
    const payload={
      nome:name.trim(),telefone:phoneDigits(phone),cpf:cpf.replace(/\D/g,''),
      email:email.trim(),data_nascimento:isoDate(birthday),profissao:occupation.trim(),
      endereco:address.trim(),observacoes:notes.trim(),origem_id:origin,
      indicador_cliente_id:indicator?.id??null,
      dono_corrente_pessoa_id:assignedOwner,motivo_corrente:reason,
      ...isNew?{
        bonificacao_registrar:bonus,bonificacao_paga:bonus&&bonusPaid&&admin,
        bonificacao_valor:bonus?money(bonusValue):null,
      }:{},
    };
    try{
      await apiRequest(isNew?'mobile/clientes':'mobile/clientes/'+id+'/editar',{
        token,method:'POST',body:payload,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
      setSuccess(isNew?'Cliente cadastrado!':'Cadastro atualizado!');
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível salvar.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(()=>{});
    }finally{setSaving(false);}
  }

  const field=(title:string,value:string,onChange:(value:string)=>void,
    placeholder:string,extra?:{multiline?:boolean;keyboardType?:'email-address'|'phone-pad'|'numeric'|'default';limit?:number})=>
    <View style={styles.field}>
      <Text style={styles.label}>{title}</Text>
      <TextInput style={[styles.input,extra?.multiline&&styles.multiline]} value={value}
        placeholder={placeholder} placeholderTextColor="#A09AB4"
        onChangeText={onChange} keyboardType={extra?.keyboardType||'default'}
        autoCapitalize={extra?.keyboardType==='email-address'?'none':'sentences'}
        multiline={extra?.multiline} textAlignVertical={extra?.multiline?'top':'center'}
        maxLength={extra?.limit}/>
    </View>;

  return <SafeAreaView style={styles.root} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.back} accessibilityLabel="Voltar" onPress={()=>router.back()}>
            <SymbolView name={{ios:'arrow.left',android:'arrow_back'}} size={20} tintColor={colors.ink}/>
          </Pressable>
          <Text style={styles.headerTitle}>{isNew?'Novo cliente':'Editar cliente'}</Text>
        </View>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CADASTRO / SPLASH</Text>
          <Text style={styles.heroTitle}>{isNew?'Um novo contato.':'Sua carteira,\nmais completa.'}</Text>
          <Text style={styles.heroText}>Mantenha os dados atualizados para facilitar as próximas visitas e vendas.</Text>
        </View>
        {loading&&<ActivityIndicator style={{marginTop:30}} color={colors.brand}/>}
        {!!error&&<View style={styles.error}><Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={()=>setError('')}><SymbolView name={{ios:'xmark',android:'close'}} tintColor="#A16B44" size={18}/></Pressable></View>}
        {!loading&&<View style={styles.form}>
          <Text style={styles.section}>INFORMAÇÕES PRINCIPAIS</Text>
          {field('Nome completo *',name,setName,'Nome e sobrenome',{limit:160})}
          {field('WhatsApp / telefone *',phone,v=>setPhone(old=>editMaskedPhoneBR(old,v)),'(21) 99999-9999',{keyboardType:'phone-pad',limit:20})}
          {field('CPF (opcional)',cpf,setCpf,'Somente números',{keyboardType:'numeric',limit:14})}
          {field('E-mail (opcional)',email,setEmail,'cliente@exemplo.com',{keyboardType:'email-address',limit:254})}
          {field('Nascimento (opcional)',birthday,setBirthday,'DD/MM/AAAA',{keyboardType:'numeric',limit:10})}
          <Text style={styles.section}>ORIGEM E INDICAÇÃO</Text>
          <Pressable style={styles.selector} onPress={()=>setPicker('origin')}>
            <Text style={styles.label}>Origem do lead *</Text>
            <Text style={styles.selectorValue}>{selectedOrigin?.nome||'Selecionar origem'}</Text>
            <SymbolView name={{ios:'chevron.up.chevron.down',android:'unfold_more'}} size={18} tintColor={colors.brandDark}/>
          </Pressable>
          {!!selectedOrigin?.permite_indicador&&<>
            <Pressable style={styles.selector} onPress={()=>setIndicatorOpen(true)}>
              <Text style={styles.label}>Quem indicou? (opcional)</Text>
              <Text style={styles.selectorValue}>{indicator?.nome||'Localizar indicador'}</Text>
              <SymbolView name={{ios:'magnifyingglass',android:'search'}} size={18} tintColor={colors.brandDark}/>
            </Pressable>
            {!!indicator&&isNew&&<View style={styles.bonusCard}>
              <Text style={styles.label}>O indicador recebeu bonificação?</Text>
              <View style={styles.bonusRow}>
                <Pressable style={[styles.bonusOption,!bonus&&styles.bonusSelected]} onPress={()=>{setBonus(false);setBonusPaid(false);}}>
                  <Text style={[styles.bonusOptionText,!bonus&&styles.bonusOptionTextSelected]}>Não</Text></Pressable>
                <Pressable style={[styles.bonusOption,bonus&&styles.bonusSelected]} onPress={()=>setBonus(true)}>
                  <Text style={[styles.bonusOptionText,bonus&&styles.bonusOptionTextSelected]}>Sim</Text></Pressable>
              </View>
              {bonus&&<>
                {field('Valor (R$)',bonusValue,setBonusValue,'30,00')}
                {admin&&<Pressable style={styles.paidRow} onPress={()=>setBonusPaid(!bonusPaid)}>
                  <SymbolView name={{ios:bonusPaid?'checkmark.circle.fill':'circle',android:bonusPaid?'check_circle':'radio_button_unchecked'}}
                    tintColor={colors.brandDark} size={21}/>
                  <Text style={styles.paidText}>Já foi pago — lançar despesa no financeiro</Text>
                </Pressable>}
                {!bonusPaid&&<Text style={styles.hint}>A bonificação ficará pendente até aprovação administrativa.</Text>}
              </>}
            </View>}
          </>}
          {!indicator&&<Pressable style={styles.selector} onPress={()=>{if(options?.minha_pessoa_id===null)setPicker('owner');}}
            disabled={options?.minha_pessoa_id!==null}>
            <Text style={styles.label}>Dono da corrente *</Text>
            <Text style={styles.selectorValue}>{ownerName||'Selecionar corretor'}</Text>
            {options?.minha_pessoa_id===null&&<SymbolView name={{ios:'chevron.up.chevron.down',android:'unfold_more'}} size={18} tintColor={colors.brandDark}/>}
          </Pressable>}
          {!!editingOwner&&field('Justificativa da mudança da corrente *',reason,setReason,'Explique a alteração',{multiline:true,limit:300})}
          <Text style={styles.section}>OUTROS DADOS</Text>
          {field('Profissão',occupation,setOccupation,'Profissão',{limit:100})}
          {field('Endereço',address,setAddress,'Rua, bairro, cidade...',{multiline:true,limit:3000})}
          {field('Observações',notes,setNotes,'Informações úteis para o atendimento',{multiline:true,limit:3000})}
        </View>}
        {!loading&&<Pressable disabled={saving} onPress={()=>{void save();}}
          style={[styles.save,saving&&styles.disabled]}>
          {saving?<ActivityIndicator color="#FFFFFF"/>:<>
            <Text style={styles.saveText}>{isNew?'Cadastrar cliente':'Salvar alterações'}</Text>
            <SymbolView name={{ios:'checkmark',android:'check'}} size={18} tintColor="#FFFFFF"/>
          </>}
        </Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
    <ChoiceSheet open={picker!==null} title={picker==='origin'?'Origem do lead':'Dono da corrente'}
      choices={picker==='origin'
        ?(options?.origens||[]).map(o=>({id:o.id,label:o.nome}))
        :(options?.corretores||[]).map(o=>({id:o.id,label:o.nome}))}
      selected={picker==='origin'?origin:owner}
      onChoose={value=>{
        if(picker==='origin'){
          setOrigin(value);setIndicator(null);setBonus(false);setBonusPaid(false);
        }
        if(picker==='owner')setOwner(value);
      }} onClose={()=>setPicker(null)}/>
    <ClientPickerModal visible={indicatorOpen} token={token} title="Quem indicou o cliente?"
      omitId={isNew?undefined:parsed} onChoose={setIndicator} onClose={()=>setIndicatorOpen(false)}/>
    <ActionModal visible={!!success} variant="success" title={success}
      description={continueToSale
        ? 'Dados do cliente salvos. Agora vamos cadastrar o título, os pagamentos e conferir as comissões.'
        : 'As informações foram registradas na carteira de clientes.'}
      primaryLabel={continueToSale?'Continuar para cadastrar a venda':'Voltar para clientes'}
      secondaryLabel={null}
      onPrimary={()=>{
        setSuccess('');
        if(continueToSale)router.replace({pathname:'/venda/[id]',
          params:{id:'novo',visita:String(saleVisitId)}});
        else router.back();
      }}/>
    <FeedbackPopup error={error} onDismiss={()=>setError('')}/>
  </SafeAreaView>;
}
const lightStyles = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},flex:{flex:1},content:{padding:18,paddingBottom:50},
  header:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:19},
  back:{height:41,width:41,borderRadius:13,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
  headerTitle:{color:colors.ink,fontSize:20,fontWeight:'900'},
  hero:{backgroundColor:colors.navy,padding:22,borderRadius:22},
  eyebrow:{color:'#D2C4FF',fontWeight:'900',letterSpacing:1.3,fontSize:10},
  heroTitle:{color:'#FFFFFF',fontWeight:'900',fontSize:23,marginTop:9},
  heroText:{color:'#D6C9F2',fontSize:12,lineHeight:19,marginTop:8},
  form:{backgroundColor:'#FFFFFF',borderRadius:22,padding:18,marginTop:16},
  section:{fontSize:10,fontWeight:'900',color:colors.brandDark,letterSpacing:1.1,marginTop:18,marginBottom:8},
  field:{marginTop:13},label:{fontSize:12,fontWeight:'800',color:colors.ink,marginBottom:7},
  input:{minHeight:52,backgroundColor:'#FAF9FF',borderWidth:1,borderColor:colors.line,
    borderRadius:14,paddingHorizontal:14,color:colors.ink,fontSize:13},
  multiline:{minHeight:85,paddingTop:13,paddingBottom:11},
  selector:{minHeight:65,borderWidth:1,borderColor:colors.line,backgroundColor:'#FAF9FF',
    borderRadius:14,paddingHorizontal:14,marginTop:12,justifyContent:'center'},
  selectorValue:{color:colors.brandDark,fontSize:13,fontWeight:'800'},
  bonusCard:{marginTop:13,padding:14,borderRadius:15,backgroundColor:colors.pale},
  bonusRow:{flexDirection:'row',gap:9,marginTop:8},
  bonusOption:{backgroundColor:'#FFFFFF',borderRadius:11,flex:1,alignItems:'center',justifyContent:'center',minHeight:39},
  bonusSelected:{backgroundColor:colors.brand},
  bonusOptionText:{color:colors.brandDark,fontWeight:'800',fontSize:12},
  bonusOptionTextSelected:{color:'#FFFFFF'},
  paidRow:{flexDirection:'row',gap:9,marginTop:13,alignItems:'center',minHeight:39},
  paidText:{flex:1,fontSize:11,color:colors.ink,fontWeight:'700'},
  hint:{fontSize:11,color:colors.muted,marginTop:9,lineHeight:17},
  error:{padding:13,backgroundColor:'#FFF1E8',borderRadius:15,flexDirection:'row',gap:10,marginTop:12},
  errorText:{color:'#A36C43',fontSize:12,flex:1,lineHeight:17},
  save:{backgroundColor:colors.brand,minHeight:55,borderRadius:16,flexDirection:'row',gap:10,
    justifyContent:'center',alignItems:'center',marginTop:18},
  saveText:{color:'#FFFFFF',fontWeight:'900',fontSize:14},
  disabled:{opacity:.55},
});
