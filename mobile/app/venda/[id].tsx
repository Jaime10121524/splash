import {useProtectedPhoto} from '../../src/useProtectedPhoto';
import FeedbackPopup from '../../src/components/FeedbackPopup';
import {useThemedStyles,useTheme} from '../../src/ThemeContext';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {SymbolView} from 'expo-symbols';
import { apiRequest, uploadMobilePhoto, VisitDetailsResponse } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import ChoiceSheet, { Choice } from '../../src/components/ChoiceSheet';
import ActionModal from '../../src/components/ActionModal';
import { colors } from '../../src/theme';

type Plan={id:number;nome:string;codigo:string;valor:string;duracao_meses:number};
type Method={id:number;nome:string;codigo:string;credito:boolean};
type Person={id:number;nome:string;papeis:string[]};
type Options={planos:Plan[];formas:Method[];gerentes:{id:number;nome:string}[];pessoas:Person[];pode_corrigir_comissao:boolean};
type Detail={operacao:{id:number;visita_id:number;situacao:'VENDA'|'PENDENCIA';data_negociacao?:string;numero_titulo:string|null;sigla_plano:string;valor_cobrado:string;data_venda:string|null;comissao_ajustada?:string|null;comissao_prevista?:string|null;observacao_comissao?:string|null};fechamento?:{id:number;status:string}|null;saldo:string;recebido:string;comissoes:{bruta:string|null;propria?:string|null;participantes:{nome:string;papel:string;devido:string}[];status:string};movimentos?:{id:number;tipo:string;forma_nome:string;valor:string;data_movimento:string}[]};
type Allocation={responsavel_pessoa_id:number;beneficiario_pessoa_id:number;papel:string;valor:string;observacoes:string};
type Rateios={corretor_pessoa_id:number;comissao_bruta:string|null;editavel:boolean;quitada:boolean;aviso:string;rateios:(Allocation & {id:number;beneficiario_nome:string})[]};

const money=(v:string|number|null|undefined)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
function cents(input:string):number|null {
  const raw=input.trim().replace(/\s|R\$/g,'');
  const s=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  if(!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s))return null;
  const p=s.split('.');
  return Number(p[0])*100+Number((p[1]||'').padEnd(2,'0'));
}
const decimal=(n:number)=>String(Math.floor(n/100))+'.'+String(n%100).padStart(2,'0');
const nowBR=()=>{const d=new Date();return [d.getDate(),d.getMonth()+1,d.getFullYear()].map((n,i)=>i<2?String(n).padStart(2,'0'):String(n)).join('/');};
function iso(s:string):string|null{
  const p=s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!p)return null;
  const dt=new Date(Date.UTC(Number(p[3]),Number(p[2])-1,Number(p[1])));
  return dt.getUTCFullYear()===Number(p[3])&&dt.getUTCMonth()+1===Number(p[2])&&dt.getUTCDate()===Number(p[1])
    ?p[3]+'-'+p[2]+'-'+p[1]:null;
}
const roles:Record<string,string>={TITULAR:'Corretor principal',ATENDENTE:'Atendente',GERENTE:'Gerente',CORRETOR:'Segundo corretor'};
const allowedRoles=['ATENDENTE','GERENTE','CORRETOR'];

function Input({label,value,onChange,placeholder,numeric=false}:{label:string;value:string;onChange:(s:string)=>void;placeholder:string;numeric?:boolean}){
  const s=useThemedStyles(lightStyles);
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={s.input} value={value} onChangeText={onChange}
    placeholder={placeholder} placeholderTextColor="#A6A0B4" keyboardType={numeric?'decimal-pad':'default'} /></View>;
}
function Select({label,value,onPress}:{label:string;value:string;onPress:()=>void}){
  const s=useThemedStyles(lightStyles);
  return <Pressable style={s.select} onPress={onPress}><View style={{flex:1}}>
    <Text style={s.label}>{label}</Text><Text style={s.selectValue}>{value}</Text></View><Text style={s.arrow}>⌄</Text>
  </Pressable>;
}
function Btn({text,onPress,muted=false,disabled=false}:{text:string;onPress:()=>void;muted?:boolean;disabled?:boolean}){
  const s=useThemedStyles(lightStyles);
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[s.button,muted&&s.buttonMuted,disabled&&{opacity:.5}]}>
    <Text style={[s.buttonText,muted&&s.buttonTextMuted]}>{text}</Text></Pressable>;
}

export default function VendaMobile(){
  const s=useThemedStyles(lightStyles);
  const {palette}=useTheme();
  const params=useLocalSearchParams<{id:string;visita?:string}>();
  const rawId=Array.isArray(params.id)?params.id[0]:params.id;
  const rawVisit=Array.isArray(params.visita)?params.visita[0]:params.visita;
  const visitId=Number(rawVisit);
  const isNew=rawId==='novo';
  const {token}=useAuth();
  const [opId,setOpId]=useState<number|null>(isNew?null:Number(rawId));
  const [visit,setVisit]=useState<VisitDetailsResponse['visita']|null>(null);
  const [opts,setOpts]=useState<Options|null>(null);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [rateios,setRateios]=useState<Rateios|null>(null);
  const [rateioRows,setRateioRows]=useState<Allocation[]>([]);
  const [step,setStep]=useState<'titulo'|'pagamento'|'comissao'>(isNew?'titulo':'pagamento');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [choice,setChoice]=useState<{field:string;index?:number}|null>(null);
  const [planId,setPlanId]=useState<number|null>(null),[managerId,setManagerId]=useState<number|null>(null);
  const [titleNumber,setTitleNumber]=useState(''),[discount,setDiscount]=useState('0,00');
  const [pendingReturn,setPendingReturn]=useState(''),[pendingNotes,setPendingNotes]=useState('');
  const [date,setDate]=useState(nowBR),[startDate,setStartDate]=useState(nowBR);
  const [methodId,setMethodId]=useState<number|null>(null),[amount,setAmount]=useState('');
  const [holder,setHolder]=useState<'CORRETOR'|'EMPRESA'>('CORRETOR');
  const [editingRateio,setEditingRateio]=useState(false),[editingGross,setEditingGross]=useState(false);
  const [grossValue,setGrossValue]=useState(''),[reason,setReason]=useState('');
  const [confirm,setConfirm]=useState(false);
  const {uri:photoUri,error:photoError,reload:reloadPhoto,setUri:setPhotoUri}=
    useProtectedPhoto(opId?'mobile/vendas/'+opId+'/foto':null,token);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [stagedPhoto,setStagedPhoto]=useState<ImagePicker.ImagePickerAsset|null>(null);
  const [photoExpanded,setPhotoExpanded]=useState(false);
  const [photoSaving,setPhotoSaving]=useState(false);
  const photoDisplayUri=stagedPhoto?.uri||photoUri;
  const plan=opts?.planos.find(x=>x.id===planId),method=opts?.formas.find(x=>x.id===methodId);
  const isPendingNew=isNew&&visit?.status==='PENDENCIA';
  const isPendingOperation=detail?.operacao.situacao==='PENDENCIA';
  const price=plan?cents(plan.valor):null,discountValue=cents(discount);
  const total=price!==null&&discountValue!==null?price-discountValue:null;

  const refresh=useCallback(async(id:number,admin:boolean)=>{
    if(!token)return;
    const d=await apiRequest<Detail>('mobile/vendas/'+id,{token});setDetail(d);
    if(admin&&d.operacao.situacao==='VENDA'){
      const r=await apiRequest<Rateios>('mobile/vendas/'+id+'/rateios',{token});
      setRateios(r);
      setRateioRows(r.rateios.map(x=>({
        responsavel_pessoa_id:x.responsavel_pessoa_id,beneficiario_pessoa_id:x.beneficiario_pessoa_id,
        papel:x.papel,valor:x.valor,observacoes:x.observacoes||'',
      })));
    }else{setRateios(null);setRateioRows([]);}
  },[token]);

  useEffect(()=>{
    if(!token)return;
    let active=true;
    setLoading(true);
    (async()=>{
      const opt=await apiRequest<Options>('mobile/vendas/opcoes',{token});
      if(!active)return;setOpts(opt);
      if(isNew){
        if(!Number.isSafeInteger(visitId)||visitId<1)throw Error('Abra a venda a partir do atendimento.');
        const v=await apiRequest<VisitDetailsResponse>('mobile/atendimentos/'+visitId,{token});
        if(!active)return;
        setVisit(v.visita);
        if(!['VENDA','PENDENCIA'].includes(v.visita.status))throw Error('Encerre o atendimento como Venda ou Pendência antes de continuar.');
        if(v.visita.operacao_id){
          router.replace({pathname:v.visita.status==='PENDENCIA'?'/pendencia/[id]':'/venda/[id]',params:{id:String(v.visita.operacao_id)}} as never);return;
        }
      }else{
        if(!Number.isSafeInteger(Number(rawId))||Number(rawId)<1)throw Error('Venda inválida.');
        await refresh(Number(rawId),opt.pode_corrigir_comissao);
      }
    })().catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível carregar a venda.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[token,isNew,visitId,rawId,refresh]);

  async function action(work:()=>Promise<void>){
    if(!token||busy)return;
    setBusy(true);setError('');setNotice('');
    try{await work();Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});}
    catch(e){setError(e instanceof Error?e.message:'Falha ao salvar. Confira os dados.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(()=>{});}
    finally{setBusy(false);}
  }

  function makePayment(amountValue:number){
    return {forma_id:methodId,valor:decimal(amountValue),data_movimento:iso(date),
      detentor:method?.codigo==='PIX'?'CORRETOR':method?.credito?'EMPRESA':holder};
  }

  async function saveTitle(){
    const kind=visit?.status==='PENDENCIA'?'PENDENCIA':'VENDA';
    if(!visit||!planId||total===null||total<=0||!iso(date)||(kind==='VENDA'&&!iso(startDate))){
      setError('Confira plano, datas e valores.');setConfirm(false);return;
    }
    if(kind==='VENDA'&&!/^\d{4}$/.test(titleNumber)){
      setError('O título precisa ter 4 dígitos.');setConfirm(false);return;
    }
    if(kind==='PENDENCIA'&&(pendingNotes.length>4000||
      (pendingReturn.trim()&&!iso(pendingReturn)))){
      setError('Confira a data de retorno e as observações da negociação.');setConfirm(false);return;
    }
    setConfirm(false);
    await action(async()=>{
      const res=await apiRequest<{operacao_id:number}>('mobile/vendas',{method:'POST',token,body:{
        cliente_id:visit.cliente_id,visita_id:visit.id,plano_versao_id:planId,situacao:kind,
        historica:false,numero_titulo:kind==='VENDA'?titleNumber:null,
        data_negociacao:iso(date),data_venda:kind==='VENDA'?iso(date):null,
        data_inicio:kind==='VENDA'?iso(startDate):null,
        retorno_previsto:kind==='PENDENCIA'?(pendingReturn.trim()?iso(pendingReturn):null):null,
        observacoes:kind==='PENDENCIA'?pendingNotes.trim():null,
        desconto_corretor:decimal(discountValue||0),
        gerente_pessoa_id:managerId,corretor_pessoa_id:visit.corretor_pessoa_id,
        segundo_corretor_pessoa_id:visit.segundo_corretor_pessoa_id,
        atendente_pessoa_id:visit.atendente_pessoa_id,atendente_adicional_pessoa_id:visit.atendente_adicional_pessoa_id,
      }});
      // A operação já existe: não tentar salvá-la outra vez se a imagem falhar.
      setOpId(res.operacao_id);
      setAmount(decimal(total));
      try{await refresh(res.operacao_id,!!opts?.pode_corrigir_comissao);}
      catch{setStep('titulo');throw new Error('Título salvo! Reabra esta venda para atualizar os dados.');}
      if(stagedPhoto){
        setPhotoBusy(true);
        try{
          const saved=await uploadMobilePhoto('mobile/vendas/'+res.operacao_id+'/foto',stagedPhoto,token!);
          setPhotoUri(saved.uri);setStagedPhoto(null);
        }catch(e){
          setStep('titulo');
          throw new Error('Título salvo! A foto não foi enviada: '+(e instanceof Error?e.message:'tente novamente')+
            '. Utilize Reenviar foto sem cadastrar o título novamente.');
        }finally{setPhotoBusy(false);}
      }
      setStep('pagamento');
      if(kind==='PENDENCIA'){
        router.replace({pathname:'/pendencia/[id]',params:{id:String(res.operacao_id)}} as never);
      }else{
        setNotice('Venda cadastrada. Agora registre os pagamentos.');
      }
    });
  }

  async function savePayment(){
    if(detail?.fechamento){setError('Venda bloqueada pelo fechamento #'+detail.fechamento.id+'.');return;}
    if(!opId||!detail||!methodId||!iso(date)){setError('Selecione forma de pagamento e data válida.');return;}
    const paid=cents(amount),balance=cents(detail.saldo);
    if(!paid||!balance||paid>balance){setError('O recebimento precisa ser positivo e não pode exceder o saldo.');return;}
    await action(async()=>{
      await apiRequest('mobile/vendas/'+opId+'/receber',{method:'POST',token,body:makePayment(paid)});
      await refresh(opId,!!opts?.pode_corrigir_comissao);
      setAmount('');
      setStep(isPendingOperation?'pagamento':balance-paid===0?'comissao':'pagamento');
      setNotice(isPendingOperation
        ?'Recebimento registrado na pendência. O valor será preservado ao converter em venda.'
        :balance-paid===0
          ?'Título quitado! Comissão e participações apuradas pelo servidor.'
          :'Pagamento registrado. Lance a próxima forma para concluir a quitação.');
    });
  }

  async function uploadPendingPhoto(id:number,asset:ImagePicker.ImagePickerAsset){
    if(detail?.fechamento){setError('Foto bloqueada pelo fechamento #'+detail.fechamento.id+'.');return;}
    if(!token||photoBusy)return;
    setPhotoBusy(true);
    try{
      const saved=await uploadMobilePhoto('mobile/vendas/'+id+'/foto',asset,token);
      setPhotoUri(saved.uri);setStagedPhoto(null);
      void reloadPhoto();
      setNotice('Foto salva e confirmada. Você já pode visualizá-la.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar a foto.');}
    finally{setPhotoBusy(false);}
  }
  async function selectPhoto(camera:boolean){
    if(detail?.fechamento){setError('A venda está vinculada ao fechamento #'+detail.fechamento.id+'.');return;}
    if(!token||photoBusy)return;
    setError('');setNotice('');
    try{
      const permission=camera?await ImagePicker.requestCameraPermissionsAsync()
        :await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted){
        setError('Autorize a câmera ou galeria nas configurações do Android.');return;
      }
      const params={mediaTypes:['images'] as ['images'],quality:.65,allowsEditing:false};
      const result=camera?await ImagePicker.launchCameraAsync(params)
        :await ImagePicker.launchImageLibraryAsync(params);
      if(result.canceled||!result.assets.length)return;
      const asset=result.assets[0];
      if(asset.fileSize&&asset.fileSize>5*1024*1024){
        setError('A foto ultrapassa 5 MB. Escolha outra imagem.');return;
      }
      setStagedPhoto(asset);
      if(opId)await uploadPendingPhoto(opId,asset);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir a câmera ou galeria.');}
  }

  /** A foto é privada: salvar a cópia local autenticada, jamais expor um link público. */
  async function downloadPhoto(){
    if(!photoUri||photoSaving)return;
    setPhotoSaving(true);setError('');setNotice('');
    try{
      const ext=photoUri.toLowerCase().match(/\.(png|webp|jpe?g)(?:$|\?)/)?.[1]||'jpg';
      const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';
      if(Platform.OS==='android'){
        const access=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if(!access.granted)return;
        const fileName='Splash-venda-'+String(opId||'foto')+'-'+Date.now();
        const target=await FileSystem.StorageAccessFramework.createFileAsync(access.directoryUri,fileName,mime);
        try{
          const data=await FileSystem.readAsStringAsync(photoUri,{encoding:FileSystem.EncodingType.Base64});
          await FileSystem.writeAsStringAsync(target,data,{encoding:FileSystem.EncodingType.Base64});
        }catch(e){await FileSystem.deleteAsync(target).catch(()=>{});throw e;}
        setPhotoExpanded(false);
        setNotice('Foto baixada na pasta escolhida do celular.');
      }else{
        if(!await Sharing.isAvailableAsync())throw Error('Não foi possível abrir as opções de salvar imagem.');
        await Sharing.shareAsync(photoUri,{mimeType:mime,dialogTitle:'Salvar foto da venda'});
        setPhotoExpanded(false);
      }
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível baixar a foto.');}
    finally{setPhotoSaving(false);}
  }

  async function adjustGross(){
    if(saleLocked){setError('Comissão bloqueada por fechamento.');return;}
    if(!opId||!opts?.pode_corrigir_comissao)return;
    const n=cents(grossValue);
    if(n===null||reason.trim().length<5){setError('Valor e justificativa de 5 caracteres são obrigatórios.');return;}
    await action(async()=>{
      await apiRequest('mobile/vendas/'+opId+'/ajustar-comissao',{method:'POST',token,
        body:{valor:decimal(n),justificativa:reason.trim()}});
      await refresh(opId,true);setEditingGross(false);setReason('');setNotice('Comissão ajustada com auditoria.');
    });
  }

  async function adjustRateios(){
    if(saleLocked){setError('Rateios bloqueados por fechamento.');return;}
    if(!opId||!rateios?.editavel)return;
    if(reason.trim().length<5){setError('Informe o motivo da correção (mínimo 5 caracteres).');return;}
    const clean:Allocation[]=[];
    for(const r of rateioRows){
      const n=cents(r.valor);
      if(!n||!r.responsavel_pessoa_id||!r.beneficiario_pessoa_id||!allowedRoles.includes(r.papel)){
        setError('Preencha função, pessoas e valores de todos os participantes.');return;
      }
      clean.push({...r,valor:decimal(n)});
    }
    await action(async()=>{
      await apiRequest('mobile/vendas/'+opId+'/rateios',{method:'POST',token,
        body:{itens:clean,justificativa:reason.trim()}});
      await refresh(opId,true);setEditingRateio(false);setReason('');
      setNotice('Rateio corrigido e registrado no histórico. Nenhum repasse foi efetuado.');
    });
  }

  const rowIndex=choice?.index||0;
  const chosenRole=rateioRows[rowIndex]?.papel;
  const choices:Choice[]=choice?.field==='plan'?(opts?.planos||[]).map(p=>({id:p.id,label:p.nome+' · '+money(p.valor)})):
    choice?.field==='method'?(opts?.formas||[]).map(m=>({id:m.id,label:m.nome})):
    choice?.field==='manager'?(opts?.gerentes||[]).map(m=>({id:m.id,label:m.nome})):
    choice?.field==='source'?(opts?.pessoas||[]).map(p=>({id:p.id,label:p.nome})):
    choice?.field==='person'?(opts?.pessoas||[]).filter(p=>p.papeis.some(role=>
      chosenRole==='GERENTE'?role==='gerente':chosenRole==='CORRETOR'?role==='corretor':
      role==='vendedor'||role==='corretor')).map(p=>({id:p.id,label:p.nome})):[];
  const selected=choice?.field==='plan'?planId:choice?.field==='method'?methodId:
    choice?.field==='manager'?managerId:choice?.field==='person'?rateioRows[rowIndex]?.beneficiario_pessoa_id:
    choice?.field==='source'?rateioRows[rowIndex]?.responsavel_pessoa_id:null;
  function changeRow(i:number,patch:Partial<Allocation>){setRateioRows(old=>old.map((r,index)=>index===i?{...r,...patch}:r));}
  const saleLocked=!!detail?.fechamento;
  const ownTotal=detail?.comissoes.propria;
  const gross=detail?.comissoes.bruta;
  const left=rateios?.comissao_bruta===null?null:
    (cents(rateios?.comissao_bruta||'')||0)-rateioRows.filter(r=>r.responsavel_pessoa_id===rateios?.corretor_pessoa_id)
      .reduce((n,r)=>n+(cents(r.valor)||0),0);

  return <SafeAreaView style={s.root} edges={['top']}>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <View style={s.header}><Pressable style={s.back} onPress={()=>router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'chevron_left'}} size={24} tintColor={palette.ink}/></Pressable>
          <View style={{flex:1}}><Text style={s.kicker}>SPLASH / COMERCIAL</Text>
            <Text style={s.title}>{isPendingNew?'Nova pendência':isPendingOperation?'Recebimentos da pendência':'Venda e comissionamento'}</Text></View></View>
        <View style={s.steps}>{(['titulo','pagamento','comissao'] as const).map((v,i)=>
          <Pressable key={v} disabled={!opId||(v==='comissao'&&isPendingOperation)} onPress={()=>setStep(v)}
            style={[s.step,step===v&&s.stepActive]}>
            <Text style={[s.stepText,step===v&&s.stepTextActive]}>
              {i+1}. {[(isPendingNew||isPendingOperation)?'Negociação':'Título','Recebimentos','Comissões'][i]}
            </Text></Pressable>)}</View>
        {loading?<ActivityIndicator color={colors.brand} size="large" style={{marginTop:45}}/>:null}


        {!loading&&step==='titulo'&&!opId&&visit&&<>
          <View style={s.card}><Text style={s.kicker}>ATENDIMENTO Nº {visit.id}</Text>
            <Text style={s.client}>{visit.cliente_nome}</Text>
            <Text style={s.helper}>Corretor: {visit.corretor_nome||'Vinculado ao atendimento'}</Text>
            <Text style={s.helper}>Atendente: {visit.atendente_nome||'Não informado'}</Text></View>
          <View style={s.card}><Text style={s.section}>{isPendingNew?'Dados da negociação':'Dados da venda'}</Text>
            {isPendingNew&&<Text style={s.helper}>Registre as condições combinadas. O título será informado quando a pendência virar venda.</Text>}
            <Select label="Plano vendido *" value={plan?plan.nome+' · '+money(plan.valor):'Selecionar plano'}
              onPress={()=>setChoice({field:'plan'})}/>
            {!isPendingNew&&<>
              <Input label="Número do título (4 dígitos) *" value={titleNumber} numeric placeholder="Ex.: 1567"
                onChange={v=>setTitleNumber(v.replace(/\D/g,'').slice(0,4))}/>
              {plan?<Text style={s.helper}>Título: {titleNumber||'____'} {plan.codigo}</Text>:null}
            </>}
            <Input label="Desconto concedido ao cliente (R$)" value={discount} numeric placeholder="0,00"
              onChange={v=>{setDiscount(v);}}/>
            <View style={s.total}><Text style={s.label}>Valor cobrado do cliente</Text>
              <Text style={s.totalValue}>{total===null||total<=0?'Inválido':money(decimal(total))}</Text></View>
            <Input label={isPendingNew?'Data da negociação * (DD/MM/AAAA)':'Data da venda * (DD/MM/AAAA)'}
              value={date} onChange={setDate} numeric placeholder="DD/MM/AAAA"/>
            {isPendingNew?<>
              <Input label="Retorno previsto (opcional, DD/MM/AAAA)" value={pendingReturn}
                onChange={setPendingReturn} numeric placeholder="DD/MM/AAAA"/>
              <Input label="Observações da negociação" value={pendingNotes}
                onChange={setPendingNotes} placeholder="O que falta para fechar?"/>
            </>:<Input label="Início da vigência * (DD/MM/AAAA)" value={startDate}
              onChange={setStartDate} numeric placeholder="DD/MM/AAAA"/>}
            <Select label="Gerente (opcional)" value={opts?.gerentes.find(p=>p.id===managerId)?.nome||'Sem gerente'}
              onPress={()=>setChoice({field:'manager'})}/>
            <Text style={s.helper}>Corretor e atendentes são herdados do atendimento. O desconto respeita as regras de comissão do sistema web.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.section}>{isPendingNew?'📸 Foto da negociação (opcional)':'📸 Foto da venda'}</Text>
            <Text style={s.helper}>{opId
              ?'Adicione ou troque a foto do título já cadastrado.'
              :'Selecione agora. A imagem será enviada automaticamente depois de salvar o título.'}</Text>
            <View style={s.salePhoto}>
              {photoDisplayUri?<Pressable style={{flex:1}} onPress={()=>setPhotoExpanded(true)}
                  accessibilityRole="button" accessibilityLabel="Expandir foto da venda">
                <Image source={{uri:photoDisplayUri}} style={s.salePhotoImage} resizeMode="contain"
                  onError={()=>setError('Não foi possível exibir a foto selecionada.')}/>
              </Pressable>:
                <View style={s.photoPlaceholder}><Text style={s.photoEmoji}>📸</Text>
                  <Text style={s.photoHint}>Registre esta conquista</Text></View>}
            </View>
            {!!photoDisplayUri&&<View style={s.photoTools}>
              <Pressable style={s.photoTool} onPress={()=>setPhotoExpanded(true)} accessibilityRole="button">
                <Text style={s.photoToolText}>⤢ Expandir</Text>
              </Pressable>
              {!!photoUri&&!stagedPhoto&&<Pressable style={s.photoTool} disabled={photoSaving}
                  onPress={()=>{void downloadPhoto();}} accessibilityRole="button">
                <Text style={s.photoToolText}>{photoSaving?'Salvando...':'↓ Baixar'}</Text>
              </Pressable>}
            </View>}
            <View style={s.photoButtons}>
              <Pressable style={s.photoButton} onPress={()=>{void selectPhoto(true);}} disabled={photoBusy}>
                <Text style={s.photoButtonText}>📷 Câmera</Text></Pressable>
              <Pressable style={s.photoButton} onPress={()=>{void selectPhoto(false);}} disabled={photoBusy}>
                <Text style={s.photoButtonText}>Galeria</Text></Pressable>
            </View>
            {opId&&stagedPhoto&&<Btn text={photoBusy?'Enviando foto...':'Reenviar foto'}
              disabled={photoBusy} onPress={()=>{void uploadPendingPhoto(opId,stagedPhoto);}}/>}
            {stagedPhoto&&!opId&&<Pressable onPress={()=>setStagedPhoto(null)}>
              <Text style={s.remove}>Remover foto selecionada</Text></Pressable>}
            <Text style={s.helper}>JPG, PNG ou WebP · até 5 MB · armazenamento privado</Text>
            {!!photoError&&<Text style={s.photoError}>{photoError}</Text>}
          </View>
          <Btn text={busy?'Salvando...':isPendingNew?'Cadastrar pendência':'Cadastrar título e continuar'} disabled={busy} onPress={()=>setConfirm(true)}/>
        </>}

        {!loading&&opId&&detail&&<>
          {saleLocked&&<View style={{padding:16,borderRadius:16,
            borderWidth:1,borderColor:'#B38B4B',backgroundColor:'#FFF4DE',gap:7}}>
            <Text style={{fontSize:14,fontWeight:'900',color:'#755121'}}>Venda bloqueada · Fechamento #{detail.fechamento?.id}</Text>
            <Text style={{fontSize:12,lineHeight:18,color:'#755121'}}>
              Apenas consulta: recebimentos, foto e comissões não podem ser alterados nesta venda.
            </Text>
          </View>}
          {step==='titulo'&&<View style={s.card}>
            <Text style={s.section}>{isPendingNew?'📸 Foto da negociação (opcional)':'📸 Foto da venda'}</Text>
            <Text style={s.helper}>{opId
              ?'Adicione ou troque a foto do título já cadastrado.'
              :'Selecione agora. A imagem será enviada automaticamente depois de salvar o título.'}</Text>
            <View style={s.salePhoto}>
              {photoDisplayUri?<Pressable style={{flex:1}} onPress={()=>setPhotoExpanded(true)}
                  accessibilityRole="button" accessibilityLabel="Expandir foto da venda">
                <Image source={{uri:photoDisplayUri}} style={s.salePhotoImage} resizeMode="contain"
                  onError={()=>setError('Não foi possível exibir a foto selecionada.')}/>
              </Pressable>:
                <View style={s.photoPlaceholder}><Text style={s.photoEmoji}>📸</Text>
                  <Text style={s.photoHint}>Registre esta conquista</Text></View>}
            </View>
            {!!photoDisplayUri&&<View style={s.photoTools}>
              <Pressable style={s.photoTool} onPress={()=>setPhotoExpanded(true)} accessibilityRole="button">
                <Text style={s.photoToolText}>⤢ Expandir</Text>
              </Pressable>
              {!!photoUri&&!stagedPhoto&&<Pressable style={s.photoTool} disabled={photoSaving}
                  onPress={()=>{void downloadPhoto();}} accessibilityRole="button">
                <Text style={s.photoToolText}>{photoSaving?'Salvando...':'↓ Baixar'}</Text>
              </Pressable>}
            </View>}
            {!saleLocked&&<View style={s.photoButtons}>
              <Pressable style={s.photoButton} onPress={()=>{void selectPhoto(true);}} disabled={photoBusy}>
                <Text style={s.photoButtonText}>📷 Câmera</Text></Pressable>
              <Pressable style={s.photoButton} onPress={()=>{void selectPhoto(false);}} disabled={photoBusy}>
                <Text style={s.photoButtonText}>Galeria</Text></Pressable>
            </View>}
            {opId&&!saleLocked&&stagedPhoto&&<Btn text={photoBusy?'Enviando foto...':'Reenviar foto'}
              disabled={photoBusy} onPress={()=>{void uploadPendingPhoto(opId,stagedPhoto);}}/>}
            {stagedPhoto&&!opId&&<Pressable onPress={()=>setStagedPhoto(null)}>
              <Text style={s.remove}>Remover foto selecionada</Text></Pressable>}
            <Text style={s.helper}>JPG, PNG ou WebP · até 5 MB · armazenamento privado</Text>
            {!!photoError&&<Text style={s.photoError}>{photoError}</Text>}
          </View>}
          <View style={s.card}>
            {step!=='titulo'&&photoUri&&<View style={s.photoSummary}>
              <Pressable onPress={()=>setPhotoExpanded(true)} accessibilityLabel="Expandir foto">
                <Image source={{uri:photoUri}} style={s.photoSummaryImage} resizeMode="contain"/>
              </Pressable>
              <View style={{flex:1}}><Text style={s.lineTitle}>Foto da venda</Text>
                <Text style={s.helper}>Imagem vertical salva no servidor</Text></View>
              <View style={s.photoSummaryActions}>
                <Pressable onPress={()=>setPhotoExpanded(true)} accessibilityRole="button">
                  <Text style={s.photoOpen}>Expandir</Text>
                </Pressable>
                <Pressable disabled={photoSaving} onPress={()=>{void downloadPhoto();}} accessibilityRole="button">
                  <Text style={s.photoOpen}>{photoSaving?'Salvando...':'↓ Baixar'}</Text>
                </Pressable>
              </View>
            </View>}
            <Text style={s.kicker}>{isPendingOperation?'PENDÊNCIA · NEGOCIAÇÃO Nº '+opId:
              'TÍTULO '+(detail.operacao.numero_titulo||'')+' '+detail.operacao.sigla_plano}</Text>
            <Text style={s.client}>{money(detail.operacao.valor_cobrado)}</Text>
            <Text style={s.helper}>Operação nº {opId} · {detail.operacao.data_venda||detail.operacao.data_negociacao}</Text>
            <View style={s.two}><View><Text style={s.label}>Recebido do cliente</Text>
              <Text style={s.lineTitle}>{money(detail.recebido)}</Text></View>
              <View><Text style={s.label}>Saldo do cliente</Text>
                <Text style={s.lineTitle}>{money(detail.saldo)}</Text></View></View></View>
          {step==='pagamento'&&<View style={s.card}><Text style={s.section}>{saleLocked?'Recebimentos registrados':isPendingOperation?'Recebimentos da negociação':'Registrar recebimento'}</Text>
            <Text style={s.helper}>{isPendingOperation
              ?'Valores recebidos agora permanecerão nesta negociação quando ela virar venda.'
              :'Registre cada forma separadamente. O sistema só apura a comissão automática após a quitação total.'}</Text>
            {!saleLocked&&Number(detail.saldo)>0?<>
              <Select label="Forma de pagamento *" value={method?.nome||'Selecionar'} onPress={()=>setChoice({field:'method'})}/>
              <Input label="Valor recebido (R$) *" value={amount} onChange={setAmount} numeric placeholder={money(detail.saldo)}/>
              {!method?.credito&&method?.codigo!=='PIX'?
                <View style={s.two}>{(['CORRETOR','EMPRESA'] as const).map(v=><Pressable key={v}
                  style={[s.chip,holder===v&&s.chipActive]} onPress={()=>setHolder(v)}>
                  <Text style={s.chipText}>{v==='CORRETOR'?'Ficou com o corretor':'Ficou com a empresa'}</Text>
                </Pressable>)}</View>:
                <Text style={s.helper}>{method?.credito?'Cartão: valor com a empresa.':method?.codigo==='PIX'?'PIX: valor com o corretor.':''}</Text>}
              <Btn text={busy?'Registrando...':'Registrar pagamento'} disabled={busy} onPress={()=>{void savePayment();}}/>
            </>:<Text style={s.done}>{saleLocked?'Venda protegida pelo fechamento. Não é possível registrar novos recebimentos.':isPendingOperation?'Valor da negociação recebido. Agora converta a pendência em venda.':'Título quitado. Comissão calculada pelo servidor.'}</Text>}
            {(detail.movimentos||[]).map(r=><View key={r.id} style={s.row}>
              <Text style={s.helper}>{r.forma_nome} · {r.data_movimento}</Text>
              <Text style={s.lineTitle}>{r.tipo==='ENTRADA'?'+':'−'} {money(r.valor)}</Text></View>)}
            {isPendingOperation?<Btn text="Fechar pendência em venda" muted
              onPress={()=>router.push({pathname:'/pendencia/[id]',params:{id:String(opId)}} as never)}/>:
              <Btn text="Conferir comissões" muted onPress={()=>setStep('comissao')}/>}
          </View>}

          {step==='comissao'&&<View style={s.card}><Text style={s.section}>Comissionamento da venda</Text>
            <Text style={s.helper}>Apuração do sistema web, conforme plano e pagamentos. Nenhum repasse é realizado nesta tela.</Text>
            {gross!==undefined&&gross!==null?<View style={s.total}>
              <Text style={s.label}>Comissão bruta</Text><Text style={s.totalValue}>{money(gross)}</Text></View>:null}
            {ownTotal!==undefined&&ownTotal!==null?<View style={s.total}>
              <Text style={s.label}>Comissão própria do corretor</Text><Text style={s.totalValue}>{money(ownTotal)}</Text></View>:null}
            {gross===null&&ownTotal==null?<Text style={s.done}>Aguardando quitação para apurar a comissão.</Text>:null}
            {detail.operacao.observacao_comissao?<Text style={s.helper}>{detail.operacao.observacao_comissao}</Text>:null}
            {(detail.comissoes.participantes||[]).map((p,i)=><View key={i} style={s.row}>
              <View style={{flex:1}}><Text style={s.lineTitle}>{p.nome}</Text>
                <Text style={s.helper}>{roles[p.papel]||p.papel}</Text></View>
              <Text style={s.lineTitle}>{money(p.devido)}</Text></View>)}
            {opts?.pode_corrigir_comissao&&!saleLocked&&Number(detail.saldo)>0&&!editingGross?
              <Btn text="Corrigir comissão bruta" muted onPress={()=>{setEditingGross(true);setGrossValue(gross||'');setReason('');}}/>:null}
            {editingGross&&<View style={s.panel}><Input label="Nova comissão bruta (R$)" value={grossValue} onChange={setGrossValue} numeric placeholder="0,00"/>
              <Input label="Justificativa *" value={reason} onChange={setReason} placeholder="Motivo da correção"/>
              <Btn text="Salvar ajuste auditado" disabled={busy} onPress={()=>{void adjustGross();}}/>
              <Btn text="Cancelar" muted onPress={()=>setEditingGross(false)}/></View>}

            {opts?.pode_corrigir_comissao&&rateios&&<View style={s.panel}>
              <Text style={s.section}>Participações e rateio</Text>
              <Text style={s.helper}>{rateios.aviso}</Text>
              {editingRateio?<>
                {rateioRows.map((r,i)=><View key={i} style={s.allocation}>
                  <Text style={s.lineTitle}>Participação {i+1}</Text>
                  <View style={s.two}>{allowedRoles.map(role=><Pressable key={role}
                    style={[s.chip,r.papel===role&&s.chipActive]}
                    onPress={()=>changeRow(i,{papel:role,beneficiario_pessoa_id:0})}>
                    <Text style={s.chipText}>{roles[role]}</Text></Pressable>)}</View>
                  <Select label="Beneficiário" value={opts.pessoas.find(p=>p.id===r.beneficiario_pessoa_id)?.nome||'Selecionar'}
                    onPress={()=>setChoice({field:'person',index:i})}/>
                  <Select label="Quem distribui" value={opts.pessoas.find(p=>p.id===r.responsavel_pessoa_id)?.nome||'Selecionar'}
                    onPress={()=>setChoice({field:'source',index:i})}/>
                  <Input label="Valor (R$)" value={r.valor} numeric onChange={v=>changeRow(i,{valor:v})} placeholder="0,00"/>
                  <Pressable onPress={()=>setRateioRows(old=>old.filter((_,j)=>j!==i))}>
                    <Text style={s.remove}>Remover</Text></Pressable></View>)}
                <View style={s.total}><Text style={s.label}>Restante do titular</Text>
                  <Text style={s.totalValue}>{left===null?'A apurar':left<0?'Inválido':money(decimal(left))}</Text></View>
                <Btn text="+ Adicionar participação" muted onPress={()=>setRateioRows(old=>[...old,{
                  responsavel_pessoa_id:rateios.corretor_pessoa_id,beneficiario_pessoa_id:0,
                  papel:'ATENDENTE',valor:'',observacoes:''}])}/>
                <Input label="Motivo da correção *" value={reason} onChange={setReason} placeholder="Explique o ajuste"/>
                <Btn text={busy?'Salvando...':'Salvar rateio auditado'} disabled={busy} onPress={()=>{void adjustRateios();}}/>
                <Btn text="Cancelar edição" muted onPress={()=>setEditingRateio(false)}/>
              </>:<>
                {rateios.rateios.map((r,i)=><View key={i} style={s.row}>
                  <View style={{flex:1}}><Text style={s.lineTitle}>{r.beneficiario_nome}</Text>
                    <Text style={s.helper}>{roles[r.papel]||r.papel}</Text></View>
                  <Text style={s.lineTitle}>{money(r.valor)}</Text></View>)}
                {!saleLocked&&rateios.editavel?<Btn text="Conferir / corrigir participações" muted
                  onPress={()=>{setEditingRateio(true);setReason('');}}/>:null}
              </>}
            </View>}
            <Btn text="Voltar ao pagamento" muted onPress={()=>setStep('pagamento')}/>
            <Btn text="Concluir e voltar ao atendimento" onPress={()=>router.replace({
              pathname:'/atendimento/[id]',params:{id:String(detail.operacao.visita_id)}})}/>
          </View>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
    <ChoiceSheet open={choice!==null}
      title={choice?.field==='plan'?'Escolher plano':choice?.field==='method'?'Forma de pagamento':
        choice?.field==='manager'?'Gerente':choice?.field==='person'?'Beneficiário':'Quem distribui'}
      choices={choices} selected={selected??null} allowEmpty={choice?.field==='manager'}
      onClose={()=>setChoice(null)} onChoose={value=>{
        if(choice?.field==='plan'){setPlanId(value);}
        if(choice?.field==='method'){setMethodId(value);}
        if(choice?.field==='manager'){setManagerId(value);}
        if(choice?.field==='person'&&choice.index!==undefined)changeRow(choice.index,{beneficiario_pessoa_id:value||0});
        if(choice?.field==='source'&&choice.index!==undefined)changeRow(choice.index,{responsavel_pessoa_id:value||0});
      }}/>
    <FeedbackPopup error={error} success={notice}
      onDismiss={()=>{setError('');setNotice('');}}/>

    <Modal visible={photoExpanded} animationType="fade" onRequestClose={()=>setPhotoExpanded(false)}>
      <SafeAreaView style={s.photoViewer} edges={['top','bottom']}>
        <View style={s.viewerHead}>
          <Text style={s.viewerTitle}>Foto da venda</Text>
          <Pressable style={s.viewerClose} onPress={()=>setPhotoExpanded(false)}
            accessibilityRole="button" accessibilityLabel="Fechar imagem">
            <SymbolView name={{ios:'xmark',android:'close'}} tintColor="#FFFFFF" size={24}/>
          </Pressable>
        </View>
        {!!photoDisplayUri&&<Image source={{uri:photoDisplayUri}} style={s.viewerImage} resizeMode="contain"/>}
        <View style={s.viewerActions}>
          {!!photoUri&&!stagedPhoto&&<Pressable style={s.viewerDownload} disabled={photoSaving}
              onPress={()=>{void downloadPhoto();}} accessibilityRole="button">
            <Text style={s.viewerDownloadText}>{photoSaving?'Salvando...':'↓ Baixar imagem'}</Text>
          </Pressable>}
          <Pressable style={s.viewerCloseButton} onPress={()=>setPhotoExpanded(false)}>
            <Text style={s.viewerCloseText}>Fechar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
    <ActionModal visible={confirm} variant="confirm" title="Cadastrar o título?"
      description="Primeiro registramos a venda. Depois os pagamentos e a apuração de comissões serão registrados com auditoria."
      primaryLabel="Sim, cadastrar" secondaryLabel="Revisar" busy={busy}
      onPrimary={()=>{void saveTitle();}} onSecondary={()=>setConfirm(false)}/>
  </SafeAreaView>;
}
const lightStyles = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  photoError:{fontSize:11,color:colors.danger,lineHeight:17},
  photoSummary:{flexDirection:'row',alignItems:'center',gap:10,padding:9,backgroundColor:colors.pale,borderRadius:13},
  photoSummaryImage:{width:55,height:74,borderRadius:10},
  photoSummaryActions:{gap:10,alignItems:'flex-end'},
  photoOpen:{fontSize:12,color:colors.brandDark,fontWeight:'900'},
  salePhoto:{height:350,width:'100%',maxWidth:290,alignSelf:'center',borderRadius:17,
    backgroundColor:colors.pale,overflow:'hidden'},
  salePhotoImage:{height:'100%',width:'100%'},
  photoTools:{flexDirection:'row',justifyContent:'center',gap:10},
  photoTool:{minHeight:38,minWidth:105,paddingHorizontal:12,alignItems:'center',justifyContent:'center',
    backgroundColor:colors.pale,borderRadius:10},
  photoToolText:{fontSize:12,fontWeight:'900',color:colors.brandDark},
  photoViewer:{flex:1,backgroundColor:'#0E1020',paddingHorizontal:16},
  viewerHead:{height:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  viewerTitle:{fontSize:17,fontWeight:'900',color:'#FFFFFF'},
  viewerClose:{width:44,height:44,alignItems:'center',justifyContent:'center'},
  viewerImage:{flex:1,width:'100%',alignSelf:'center'},
  viewerActions:{flexDirection:'row',gap:10,paddingBottom:12,paddingTop:10},
  viewerDownload:{flex:1,backgroundColor:'#7861F9',borderRadius:12,minHeight:48,
    alignItems:'center',justifyContent:'center'},
  viewerDownloadText:{fontSize:14,color:'#FFFFFF',fontWeight:'900'},
  viewerCloseButton:{minWidth:95,minHeight:48,borderRadius:12,borderWidth:1,
    borderColor:'#7B7C8D',alignItems:'center',justifyContent:'center',paddingHorizontal:15},
  viewerCloseText:{fontSize:13,fontWeight:'800',color:'#FFFFFF'},
  photoPlaceholder:{flex:1,alignItems:'center',justifyContent:'center',gap:8},
  photoEmoji:{fontSize:38},photoHint:{fontSize:12,fontWeight:'800',color:colors.brandDark},
  photoButtons:{flexDirection:'row',gap:10},
  photoButton:{flex:1,backgroundColor:colors.pale,borderRadius:12,padding:13,alignItems:'center'},
  photoButtonText:{color:colors.brandDark,fontSize:12,fontWeight:'900'},
  content:{paddingHorizontal:18,paddingTop:12,paddingBottom:50,gap:14},
  header:{flexDirection:'row',alignItems:'center',gap:12},
  back:{width:42,height:42,backgroundColor:'#FFFFFF',borderRadius:14,borderWidth:1,
    borderColor:colors.line,alignItems:'center',justifyContent:'center'},
  kicker:{color:colors.brandDark,fontSize:10,fontWeight:'900',letterSpacing:1.1},
  title:{fontSize:22,color:colors.ink,fontWeight:'900'},
  steps:{flexDirection:'row',gap:5},
  step:{flex:1,paddingVertical:13,paddingHorizontal:4,backgroundColor:'#FFFFFF',
    alignItems:'center',borderRadius:11},
  stepActive:{backgroundColor:colors.brand},
  stepText:{fontSize:10,fontWeight:'900',color:colors.muted},
  stepTextActive:{color:'#FFFFFF'},
  card:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line,
    borderRadius:22,padding:17,gap:13},
  section:{fontSize:16,fontWeight:'900',color:colors.ink},
  client:{fontSize:20,fontWeight:'900',color:colors.navy},
  helper:{fontSize:12,color:colors.muted,lineHeight:18},
  field:{gap:6},
  label:{fontSize:11,fontWeight:'800',color:colors.muted},
  input:{backgroundColor:'#FAFAFF',borderWidth:1,borderColor:colors.line,borderRadius:13,
    height:49,paddingHorizontal:13,fontSize:15,color:colors.ink},
  select:{backgroundColor:'#FAFAFF',borderWidth:1,borderColor:colors.line,borderRadius:13,
    padding:13,flexDirection:'row',alignItems:'center'},
  selectValue:{fontSize:14,fontWeight:'800',color:colors.ink,marginTop:6},
  arrow:{fontSize:23,color:colors.brandDark},
  total:{backgroundColor:'#F2EEFF',borderRadius:14,padding:13,
    flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
  totalValue:{fontSize:17,fontWeight:'900',color:colors.brandDark},
  button:{minHeight:51,backgroundColor:colors.brand,borderRadius:15,
    alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  buttonMuted:{backgroundColor:'#F1ECFF'},
  buttonText:{color:'#FFFFFF',fontWeight:'900',fontSize:14,textAlign:'center'},
  buttonTextMuted:{color:colors.brandDark},
  panel:{borderRadius:15,backgroundColor:'#F8F6FF',padding:12,gap:10},
  two:{flexDirection:'row',flexWrap:'wrap',gap:9,justifyContent:'space-between'},
  row:{paddingVertical:9,flexDirection:'row',alignItems:'center',
    justifyContent:'space-between',gap:8,borderBottomColor:colors.line,borderBottomWidth:1},
  lineTitle:{fontSize:13,fontWeight:'900',color:colors.ink},
  chip:{padding:8,borderRadius:10,backgroundColor:'#F2EEF9',borderWidth:1,borderColor:colors.line},
  chipActive:{backgroundColor:'#E4D8FF',borderColor:colors.brand},
  chipText:{fontSize:11,fontWeight:'800',color:colors.brandDark},
  allocation:{borderWidth:1,borderColor:colors.line,borderRadius:13,padding:10,gap:9},
  remove:{color:colors.danger,fontWeight:'900',textAlign:'right'},
  done:{fontSize:13,color:colors.brandDark,fontWeight:'800'},
  error:{borderRadius:12,backgroundColor:'#FFF0E9',padding:12},
  errorText:{fontSize:12,color:'#9E4B30',lineHeight:18},
  notice:{borderRadius:12,backgroundColor:'#E9F7EF',padding:12},
  noticeText:{fontSize:12,color:'#16643B',lineHeight:18},
});
