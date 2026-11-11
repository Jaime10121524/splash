import {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {SymbolView} from 'expo-symbols';
import {apiRequest} from '../api';
import {useAuth} from '../AuthContext';
import {useTheme,useThemedStyles} from '../ThemeContext';
import {colors} from '../theme';
import ChoiceSheet from './ChoiceSheet';
import DateRangeCalendar from './DateRangeCalendar';
import FinanceDatePicker from './FinanceDatePicker';
import ActionModal from './ActionModal';

type Kind='gastos'|'emprestimos';
type Person={id:number;nome:string};
type Category={id:number;nome:string;pessoa_id:number|null;ativo:number};
type Expense={
  id:number;pessoa_id:number;categoria_id:number;categoria_nome:string;
  pessoa_nome:string;data_despesa:string;valor:string;descricao:string;
  situacao:string;
};
type Loan={
  id:number;pessoa_id:number;pessoa_nome:string;data_emprestimo:string;
  valor:string;descricao:string;situacao:string;saldo:string;abatido:string;
};
type PersonalData={
  despesas:Expense[];emprestimos:Loan[];categorias:Category[];
  resumo:{despesas_periodo:string;saldo_emprestimos:string};
  permissoes:{admin:boolean;cadastrar_gasto:boolean;cadastrar_emprestimo:boolean};
  limite_resultados:number;
};

const iso=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),
  String(d.getDate()).padStart(2,'0')].join('-');
const today=()=>iso(new Date());
const initialPeriod=()=>{
  const now=new Date();
  return {start:iso(new Date(now.getFullYear(),now.getMonth(),1)),end:iso(now)};
};
const br=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)
  ?date.slice(8)+'/'+date.slice(5,7)+'/'+date.slice(0,4):date;
const money=(amount:string|number|null|undefined)=>
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(amount||0));

function amountDecimal(raw:string):string|null{
  let v=raw.trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
  if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');
  if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(v))return null;
  const amount=Number(v);
  return Number.isFinite(amount)&&amount>0?amount.toFixed(2):null;
}

export default function FinanceiroLancamentosMobile({kind}:{kind:Kind}){
  const isExpense=kind==='gastos';
  const {user,token}=useAuth();
  const {palette}=useTheme();
  const s=useThemedStyles(styles);
  const isAdmin=user?.role==='admin';
  const [data,setData]=useState<PersonalData|null>(null);
  const [people,setPeople]=useState<Person[]>([]);
  const [filterPerson,setFilterPerson]=useState<number|null>(null);
  const [period,setPeriod]=useState(initialPeriod);
  const [rangeOpen,setRangeOpen]=useState(false);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const requestSeq=useRef(0);
  const [error,setError]=useState('');
  const [formOpen,setFormOpen]=useState(false);
  const [formPerson,setFormPerson]=useState<number|null>(null);
  const [formCategory,setFormCategory]=useState<number|null>(null);
  const [formDate,setFormDate]=useState(today);
  const [formValue,setFormValue]=useState('');
  const [formDescription,setFormDescription]=useState('');
  const [personSheet,setPersonSheet]=useState<'filter'|'form'|null>(null);
  const [categorySheet,setCategorySheet]=useState(false);
  const [dateOpen,setDateOpen]=useState(false);
  const [newCategory,setNewCategory]=useState(false);
  const [categoryName,setCategoryName]=useState('');
  const [feedback,setFeedback]=useState<{variant:'error'|'success';title:string;description:string}|null>(null);
  const [confirm,setConfirm]=useState(false);

  const load=useCallback(async()=>{
    if(!token)return;
    const request=++requestSeq.current;
    setLoading(true);
    try{
      const query=new URLSearchParams({inicio:period.start,fim:period.end});
      if(isAdmin&&filterPerson)query.set('pessoa_id',String(filterPerson));
      const [result,available]=await Promise.all([
        apiRequest<PersonalData>('mobile/financeiro/pessoal?'+query.toString(),{token}),
        isAdmin?apiRequest<{pessoas:Person[]}>('mobile/financeiro/pessoas',{token})
          :Promise.resolve({pessoas:[] as Person[]}),
      ]);
      if(request===requestSeq.current){
        setData(result);setPeople(available.pessoas);setError('');
      }
    }catch(e){
      if(request===requestSeq.current){
        setError(e instanceof Error?e.message:'Não foi possível consultar os lançamentos.');
      }
    }finally{
      if(request===requestSeq.current){setLoading(false);setRefreshing(false);}
    }
  },[token,isAdmin,filterPerson,period.start,period.end]);
  useFocusEffect(useCallback(()=>{
    void load();
    return()=>{requestSeq.current++;};
  },[load]));

  const rows=isExpense?data?.despesas||[]:data?.emprestimos||[];
  const canCreate=isExpense?!!data?.permissoes.cadastrar_gasto:
    !!data?.permissoes.cadastrar_emprestimo;
  const nameFor=(id:number|null)=>people.find(p=>p.id===id)?.nome||'Escolher pessoa';
  const availableCategories=(data?.categorias||[]).filter(c=>
    Number(c.ativo)!==0 &&
    (c.pessoa_id===null || (isAdmin ? c.pessoa_id===formPerson : true)));
  const categoryFor=(id:number|null)=>availableCategories.find(c=>c.id===id)?.nome||'Escolher categoria';

  function openForm(){
    setFormPerson(isAdmin?filterPerson:null);
    setFormCategory(null);setFormDate(today());
    setFormValue('');setFormDescription('');
    setNewCategory(false);setCategoryName('');
    setFormOpen(true);
  }
  function showError(text:string){
    setFeedback({variant:'error',title:'Confira o lançamento',description:text});
  }
  function validate():string|null{
    if(!canCreate)return 'Sua conta não pode registrar esse lançamento.';
    if(isAdmin&&!formPerson)return 'Escolha quem receberá o lançamento.';
    if(isExpense&&!formCategory)return 'Selecione a categoria do gasto.';
    if(isExpense&&formCategory&&!availableCategories.some(c=>c.id===formCategory)){
      return 'A categoria não pertence à pessoa selecionada.';
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(formDate))return 'Escolha uma data válida.';
    if(!amountDecimal(formValue))return 'Informe um valor positivo com até duas casas decimais.';
    if(!formDescription.trim()||formDescription.trim().length>500){
      return 'Descreva o lançamento em até 500 caracteres.';
    }
    return null;
  }
  function askSave(){
    const invalid=validate();
    if(invalid){showError(invalid);return;}
    setConfirm(true);
  }

  async function save(){
    if(!token||busyRef.current)return;
    const invalid=validate();
    if(invalid){setConfirm(false);showError(invalid);return;}
    busyRef.current=true;setBusy(true);
    try{
      const path=isExpense?'mobile/financeiro/gastos':'mobile/financeiro/emprestimos';
      const body:Record<string,string|number>={
        valor:amountDecimal(formValue)!,
        descricao:formDescription.trim(),
        [isExpense?'data_despesa':'data_emprestimo']:formDate,
      };
      if(isAdmin&&formPerson)body.pessoa_id=formPerson;
      if(isExpense&&formCategory)body.categoria_id=formCategory;
      const result=await apiRequest<{message:string}>(path,{method:'POST',token,body});
      setConfirm(false);setFormOpen(false);
      setFeedback({variant:'success',title:isExpense?'Gasto registrado':'Empréstimo registrado',
        description:result.message+(isExpense
          ?' O gasto não desconta automaticamente as comissões.'
          :' O saldo será abatido somente quando registrado no fechamento.')});
      void load();
    }catch(e){
      setConfirm(false);
      showError(e instanceof Error?e.message:'O servidor não confirmou o lançamento.');
    }finally{busyRef.current=false;setBusy(false);}
  }

  async function saveCategory(){
    if(!token||busyRef.current)return;
    if(!canCreate)return showError('Sua conta não pode cadastrar categorias.');
    if(isAdmin&&!formPerson)return showError('Escolha primeiro a pessoa responsável pelo gasto.');
    const name=categoryName.trim();
    if(!name||name.length>90)return showError('Informe uma categoria de até 90 caracteres.');
    busyRef.current=true;setBusy(true);
    try{
      await apiRequest('mobile/financeiro/categorias',{method:'POST',token,
        body:{nome:name,...(isAdmin&&formPerson?{pessoa_id:formPerson}:{})}});
      setCategoryName('');setNewCategory(false);
      await load();
      setFeedback({variant:'success',title:'Categoria criada',
        description:'A categoria foi cadastrada. Agora selecione-a no formulário do gasto.'});
    }catch(e){
      showError(e instanceof Error?e.message:'Não foi possível cadastrar a categoria.');
    }finally{busyRef.current=false;setBusy(false);}
  }

  const title=isExpense?'Gastos':'Empréstimos';
  const valueTotal=isExpense?data?.resumo.despesas_periodo:data?.resumo.saldo_emprestimos;
  return <SafeAreaView style={s.root} edges={['top']}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={palette.brand}
        onRefresh={()=>{setRefreshing(true);void load();}}/>}>
      <View style={s.header}>
        <Pressable style={s.back} onPress={()=>router.back()} accessibilityLabel="Voltar">
          <SymbolView name={{ios:'chevron.left',android:'chevron_left'}}
            size={23} tintColor={palette.ink}/>
        </Pressable>
        <View style={{flex:1}}>
          <Text style={s.kicker}>SPLASH / FINANCEIRO</Text>
          <Text style={s.title}>{title}</Text>
        </View>
      </View>
      <View style={s.hero}>
        <Text style={s.heroName}>{isExpense?'Gastos do período':'Saldo de empréstimos'}</Text>
        <Text style={s.heroValue}>{money(valueTotal||0)}</Text>
        <Text style={s.heroNote}>{isExpense
          ?'Despesas registradas, sem baixa automática nas comissões.'
          :'Saldo total em aberto, após os abatimentos já confirmados.'}</Text>
      </View>
      {isAdmin&&<Pressable style={s.select}
        onPress={()=>setPersonSheet('filter')} accessibilityRole="button">
        <View style={{flex:1}}>
          <Text style={s.fieldCaption}>CONSULTAR CONTA</Text>
          <Text style={s.selectText}>{filterPerson?nameFor(filterPerson):'Todas as pessoas'}</Text>
        </View>
        <Text style={s.chevron}>⌄</Text>
      </Pressable>}
      {isExpense&&<Pressable style={s.select} onPress={()=>setRangeOpen(true)}>
        <View style={{flex:1}}>
          <Text style={s.fieldCaption}>PERÍODO DO GASTO</Text>
          <Text style={s.selectText}>{br(period.start)} até {br(period.end)}</Text>
        </View>
        <Text style={s.chevron}>▦</Text>
      </Pressable>}
      {canCreate&&!formOpen&&<Pressable style={s.primary} onPress={openForm}>
        <Text style={s.primaryText}>{isExpense?'+ Registrar gasto':'+ Registrar empréstimo'}</Text>
      </Pressable>}
      {formOpen&&<View style={s.form}>
        <Text style={s.formTitle}>{isExpense?'Novo gasto':'Novo empréstimo'}</Text>
        {isAdmin&&<Pressable style={s.select} onPress={()=>setPersonSheet('form')}>
          <View style={{flex:1}}>
            <Text style={s.fieldCaption}>PESSOA RESPONSÁVEL *</Text>
            <Text style={s.selectText}>{nameFor(formPerson)}</Text>
          </View>
          <Text style={s.chevron}>⌄</Text>
        </Pressable>}
        {isExpense&&<>
          <Pressable style={s.select} onPress={()=>setCategorySheet(true)}>
            <View style={{flex:1}}>
              <Text style={s.fieldCaption}>CATEGORIA *</Text>
              <Text style={s.selectText}>{categoryFor(formCategory)}</Text>
            </View>
            <Text style={s.chevron}>⌄</Text>
          </Pressable>
          <Pressable onPress={()=>setNewCategory(v=>!v)}>
            <Text style={s.link}>{newCategory?'Fechar cadastro de categoria':'+ Nova categoria'}</Text>
          </Pressable>
          {newCategory&&<View style={s.categoryForm}>
            <Text style={s.fieldCaption}>NOME DA NOVA CATEGORIA</Text>
            <TextInput value={categoryName} onChangeText={setCategoryName}
              maxLength={90} placeholder="Ex.: Pedágio" placeholderTextColor={palette.muted}
              style={s.input}/>
            <Pressable disabled={busy} style={s.secondary} onPress={()=>{void saveCategory();}}>
              <Text style={s.secondaryText}>Salvar categoria</Text>
            </Pressable>
          </View>}
        </>}
        <Text style={s.fieldCaption}>DATA *</Text>
        <Pressable style={s.select} onPress={()=>setDateOpen(true)}>
          <Text style={s.selectText}>{br(formDate)}</Text>
          <Text style={s.chevron}>▦</Text>
        </Pressable>
        <Text style={s.fieldCaption}>VALOR (R$) *</Text>
        <TextInput value={formValue} onChangeText={setFormValue}
          placeholder="0,00" placeholderTextColor={palette.muted}
          keyboardType="decimal-pad" style={s.input} maxLength={17}/>
        <Text style={s.fieldCaption}>DESCRIÇÃO *</Text>
        <TextInput value={formDescription} onChangeText={setFormDescription}
          placeholder={isExpense?'Ex.: Transporte para evento':'Ex.: Empréstimo solicitado pela pessoa'}
          placeholderTextColor={palette.muted}
          multiline style={[s.input,s.multiline]} maxLength={500} textAlignVertical="top"/>
        <Text style={s.helper}>{isExpense
          ?'Este registro pertence à conta selecionada e não é desconto automático de comissão.'
          :'O empréstimo fica vinculado à pessoa; abatimentos são registrados posteriormente no fechamento.'}</Text>
        <View style={s.formActions}>
          <Pressable style={s.cancelButton} disabled={busy}
            onPress={()=>{setFormOpen(false);setNewCategory(false);}}>
            <Text style={s.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable style={s.saveButton} disabled={busy}
            onPress={askSave}>
            {busy?<ActivityIndicator color="#FFFFFF"/>:
              <Text style={s.primaryText}>Conferir e salvar</Text>}
          </Pressable>
        </View>
      </View>}
      {!!error&&<View style={s.error}>
        <Text style={s.errorText}>{error}</Text>
        <Pressable onPress={()=>{void load();}}><Text style={s.link}>Tentar novamente</Text></Pressable>
      </View>}
      <Text style={s.section}>{isExpense?'Gastos registrados':'Empréstimos e abatimentos'}</Text>
      {loading?<ActivityIndicator color={palette.brand} size="large"/>:
        rows.length?rows.map(entry=>isExpense?(()=>{
          const item=entry as Expense;
          return <View key={item.id} style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.cardTitle}>{item.categoria_nome}</Text>
              <Text style={s.cardAmount}>{money(item.valor)}</Text>
            </View>
            <Text style={s.description}>{item.descricao}</Text>
            <Text style={s.muted}>{br(item.data_despesa)} · {item.pessoa_nome}</Text>
            {item.situacao!=='ATIVA'&&<Text style={s.cancelled}>Cancelado</Text>}
          </View>;
        })():(()=>{
          const item=entry as Loan;
          return <View key={item.id} style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.cardTitle}>Empréstimo Nº {item.id}</Text>
              <Text style={s.cardAmount}>{money(item.saldo)}</Text>
            </View>
            <Text style={s.description}>{item.descricao}</Text>
            <Text style={s.muted}>{br(item.data_emprestimo)} · {item.pessoa_nome}</Text>
            <View style={s.loanValues}>
              <Text style={s.muted}>Emprestado: {money(item.valor)}</Text>
              <Text style={s.muted}>Abatido: {money(item.abatido)}</Text>
            </View>
            {item.situacao!=='ATIVO'&&<Text style={s.cancelled}>Cancelado</Text>}
          </View>;
        })()):<View style={s.empty}>
          <Text style={s.cardTitle}>Nenhum lançamento encontrado</Text>
          <Text style={s.muted}>{isExpense?'Escolha outro período ou registre um gasto.':
            'Os empréstimos cadastrados aparecerão aqui.'}</Text>
        </View>}
      <Text style={s.helper}>Os valores são consultados no mesmo banco do sistema web.
        Esta tela não altera comissões nem fecha períodos automaticamente.</Text>
    </ScrollView>
    <ChoiceSheet open={personSheet!==null}
      title={personSheet==='filter'?'Consultar conta':'Responsável pelo lançamento'}
      choices={people.map(p=>({id:p.id,label:p.nome}))}
      selected={personSheet==='filter'?filterPerson:formPerson}
      allowEmpty={personSheet==='filter'}
      onChoose={id=>{
        if(personSheet==='filter')setFilterPerson(id);
        else {setFormPerson(id);setFormCategory(null);}
      }}
      onClose={()=>setPersonSheet(null)}/>
    <ChoiceSheet open={categorySheet} title="Escolha a categoria"
      choices={availableCategories.map(c=>({id:c.id,label:c.nome}))}
      selected={formCategory} onChoose={setFormCategory}
      onClose={()=>setCategorySheet(false)}/>
    <DateRangeCalendar open={rangeOpen} start={period.start} end={period.end}
      onClose={()=>setRangeOpen(false)}
      onConfirm={(start,end)=>{setPeriod({start,end});setRangeOpen(false);}}/>
    <FinanceDatePicker open={dateOpen} value={formDate}
      onClose={()=>setDateOpen(false)} onChange={setFormDate}/>
    <ActionModal visible={confirm} variant="confirm"
      title="Confirmar lançamento"
      description={'Registrar '+(isExpense?'gasto':'empréstimo')+' de '+money(amountDecimal(formValue)||0)+
        ' para '+(isAdmin?nameFor(formPerson):'sua conta')+'?'}
      primaryLabel="Confirmar e registrar" secondaryLabel="Voltar"
      busy={busy} onPrimary={()=>{void save();}} onSecondary={()=>setConfirm(false)}/>
    <ActionModal visible={feedback!==null}
      variant={feedback?.variant||'error'}
      title={feedback?.title||''} description={feedback?.description||''}
      primaryLabel="Entendi" secondaryLabel={null} onPrimary={()=>setFeedback(null)}/>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  content:{padding:18,paddingBottom:50,gap:13},
  header:{flexDirection:'row',alignItems:'center',gap:12},
  back:{height:45,width:45,alignItems:'center',justifyContent:'center',
    backgroundColor:'#FFFFFF',borderRadius:13},
  kicker:{fontSize:10,color:colors.brandDark,fontWeight:'900',letterSpacing:1},
  title:{fontSize:25,color:colors.ink,fontWeight:'900'},
  hero:{backgroundColor:colors.navy,borderRadius:20,padding:19,gap:8},
  heroName:{fontSize:12,fontWeight:'800',color:'#E4DDF8'},
  heroValue:{fontSize:28,fontWeight:'900',color:'#FFFFFF'},
  heroNote:{fontSize:11,lineHeight:17,color:'#E1DAF8'},
  select:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line,
    borderRadius:13,padding:13,minHeight:52,flexDirection:'row',alignItems:'center'},
  fieldCaption:{fontSize:10,fontWeight:'900',color:colors.muted,letterSpacing:.4},
  selectText:{fontSize:14,fontWeight:'800',color:colors.ink,marginTop:3},
  chevron:{fontSize:23,color:colors.brandDark,paddingHorizontal:7},
  primary:{backgroundColor:colors.brand,borderRadius:14,minHeight:52,
    alignItems:'center',justifyContent:'center'},
  primaryText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},
  form:{backgroundColor:'#FFFFFF',borderRadius:20,padding:16,
    borderColor:colors.line,borderWidth:1,gap:10},
  formTitle:{fontSize:18,fontWeight:'900',color:colors.ink},
  input:{minHeight:51,borderRadius:13,borderWidth:1,borderColor:colors.line,
    backgroundColor:'#FFFFFF',color:colors.ink,fontSize:15,paddingHorizontal:13},
  multiline:{minHeight:85,paddingTop:14},
  link:{fontWeight:'900',color:colors.brandDark,fontSize:12,paddingVertical:5},
  categoryForm:{padding:12,gap:8,borderRadius:12,backgroundColor:colors.pale},
  secondary:{borderRadius:11,minHeight:43,alignItems:'center',
    justifyContent:'center',backgroundColor:colors.navy},
  secondaryText:{color:'#FFFFFF',fontWeight:'900',fontSize:12},
  helper:{fontSize:11,lineHeight:18,color:colors.muted},
  formActions:{flexDirection:'row',gap:8,marginTop:7},
  cancelButton:{flex:1,padding:13,alignItems:'center',
    justifyContent:'center',borderRadius:12,backgroundColor:colors.pale},
  cancelText:{fontWeight:'900',color:colors.brandDark},
  saveButton:{flex:2,padding:13,alignItems:'center',justifyContent:'center',
    backgroundColor:colors.brand,borderRadius:12},
  error:{padding:13,backgroundColor:'#FFF0E9',borderRadius:12,gap:6},
  errorText:{color:colors.danger,fontSize:12},
  section:{fontSize:16,fontWeight:'900',color:colors.ink,marginTop:4},
  card:{borderRadius:16,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:colors.line,
    padding:15,gap:8},
  cardTop:{flexDirection:'row',justifyContent:'space-between',gap:10,alignItems:'center'},
  cardTitle:{flex:1,color:colors.ink,fontSize:14,fontWeight:'900'},
  cardAmount:{color:colors.brandDark,fontSize:17,fontWeight:'900'},
  description:{fontSize:13,color:colors.ink},
  muted:{fontSize:11,color:colors.muted,lineHeight:16},
  cancelled:{fontSize:11,fontWeight:'900',color:colors.danger},
  loanValues:{flexDirection:'row',gap:13,flexWrap:'wrap'},
  empty:{backgroundColor:'#FFFFFF',borderRadius:15,padding:23,gap:8},
});
