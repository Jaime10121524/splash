import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './FinanceiroPessoal.css'

const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const decimal=raw=>{
  const s=String(raw||'').trim()
  const value=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)?value:null
}
const day=()=>localDateISO()

/** Uma pessoa só acessa sua conta no servidor; o seletor administrativo não concede permissões. */
export default function FinanceiroPessoal({role='admin',tab='despesas',start,end,initialPerson='' }){
  const admin=role==='admin'
  const [person,setPerson]=useState(initialPerson)
  const [people,setPeople]=useState([])
  const [data,setData]=useState(null)
  const [busy,setBusy]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [form,setForm]=useState(null)
  const [expense,setExpense]=useState({data_despesa:day(),categoria_id:'',valor:'',descricao:''})
  const [category,setCategory]=useState('')
  const [loan,setLoan]=useState({data_emprestimo:day(),valor:'',descricao:''})
  const [cancelId,setCancelId]=useState(null)
  const [cancelLoanId,setCancelLoanId]=useState(null)
  const [cancelReason,setCancelReason]=useState('')
  const load=async()=>{
    const params=new URLSearchParams({inicio:start,fim:end})
    if(admin&&person)params.set('pessoa_id',person)
    const res=await comercialGet('/api/financeiro/pessoal?'+params)
    setData(res)
  }
  useEffect(()=>{
    let live=true
    if(!admin)return
    comercialGet('/api/pessoas').then(r=>{
      if(live)setPeople((r.pessoas||[]).filter(p=>p.ativo))
    }).catch(e=>{if(live)setError(e.message)})
    return ()=>{live=false}
  },[admin])
  useEffect(()=>{
    let live=true
    setBusy(true)
    const params=new URLSearchParams({inicio:start,fim:end})
    if(admin&&person)params.set('pessoa_id',person)
    comercialGet('/api/financeiro/pessoal?'+params)
      .then(res=>{if(live){setData(res);setError('')}})
      .catch(e=>{if(live)setError(e.message)})
      .finally(()=>{if(live)setBusy(false)})
    return ()=>{live=false}
  },[admin,person,start,end])
  const options=people.map(p=>({value:String(p.id),label:p.nome}))
  async function submit(endpoint,payload,success){
    setSaving(true);setError('')
    try{
      const result=await comercialPost(endpoint,payload)
      setNotice(result.message||success)
      setForm(null);setCancelId(null);setCancelLoanId(null);setCancelReason('')
      await load()
    }catch(e){setError(e.message)}
    finally{setSaving(false)}
  }
  const personForForm=admin?Number(person)||null:undefined
  const ensurePerson=()=>!admin || !!person
  const createExpense=e=>{
    e.preventDefault()
    const valor=decimal(expense.valor)
    if(!ensurePerson())return setError('Selecione uma pessoa para cadastrar uma despesa.')
    if(!valor||Number(valor)<=0)return setError('Informe o valor da despesa.')
    submit('/api/financeiro/despesas',{
      ...expense,valor,pessoa_id:personForForm,
      categoria_id:Number(expense.categoria_id),
    },'Despesa registrada.')
  }
  const createCategory=e=>{
    e.preventDefault()
    if(!ensurePerson())return setError('Selecione a pessoa que terá esta categoria.')
    if(!category.trim())return setError('Informe o nome da categoria.')
    submit('/api/financeiro/categorias',{nome:category,pessoa_id:personForForm},'Categoria salva.')
    setCategory('')
  }
  const createLoan=e=>{
    e.preventDefault()
    const valor=decimal(loan.valor)
    if(!personForForm)return setError('Selecione quem recebeu o empréstimo.')
    if(!valor||Number(valor)<=0)return setError('Informe o valor do empréstimo.')
    submit('/api/financeiro/emprestimos',{...loan,valor,pessoa_id:personForForm},'Empréstimo registrado.')
  }
  const cancelExpense=e=>{
    e.preventDefault()
    if(cancelReason.trim().length<5)return setError('Explique por que deseja cancelar a despesa.')
    submit('/api/financeiro/despesas/'+cancelId+'/cancelar',{
      justificativa:cancelReason.trim(),
    },'Despesa cancelada.')
  }
  const cancelLoan=e=>{
    e.preventDefault()
    if(cancelReason.trim().length<5)return setError('Explique o cancelamento do empréstimo.')
    submit('/api/financeiro/emprestimos/'+cancelLoanId+'/cancelar',{
      justificativa:cancelReason.trim(),
    },'Empréstimo cancelado.')
  }
  const expenses=data?.despesas||[],loans=data?.emprestimos||[]
  const loanBalance=Number(data?.resumo?.saldo_emprestimos||0)
  return <div className="fp-main">
    <div className="fp-header">
      <div><h2>{tab==='despesas'?'Controle de despesas':'Empréstimos do clube'}</h2>
        <p>{tab==='despesas'?'Gastos por pessoa, categoria e período. Não são descontos automáticos de comissões.':
          'Cada empréstimo pertence a uma pessoa. O valor a abater é informado no acerto da semana.'}</p></div>
      {admin&&<label>Conta de
        <FormControl type="select" value={person} onChange={v=>{setPerson(v);setForm(null)}}
          options={[{value:'',label:'Todas as pessoas'},...options]}/></label>}
    </div>
    {notice&&<div className="com-alert success" role="status">{notice}
      <button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}
      <button type="button" onClick={()=>setError('')}>Fechar</button></div>}
    {busy?<div className="com-panel"><div className="com-empty">Carregando o financeiro pessoal...</div></div>:<>
      {tab==='despesas'?<>
        <div className="fp-stats">
          <div><span>Gastos ativos no período</span><strong>{brl(data?.resumo?.despesas_periodo)}</strong></div>
          <div><span>Despesas cadastradas</span><strong>{expenses.filter(e=>e.situacao==='ATIVA').length}</strong></div>
        </div>
        <div className="fp-actions">
          <button className="cm-button primary" type="button" onClick={()=>setForm(form==='expense'?null:'expense')}>+ Nova despesa</button>
          <button className="vd-outline" type="button" onClick={()=>setForm(form==='category'?null:'category')}>+ Categoria</button>
        </div>
        {form==='category'&&<form className="fp-form" onSubmit={createCategory}>
          <h3>Nova categoria pessoal</h3>
          <label>Nome da categoria <input maxLength={90} value={category} onChange={e=>setCategory(e.target.value)}
            placeholder="Ex.: Bonificações" required/></label>
          <div className="fp-buttons"><button type="button" className="vd-outline" onClick={()=>setForm(null)}>Cancelar</button>
            <button className="cm-button primary" disabled={saving} type="submit">Salvar categoria</button></div>
        </form>}
        {form==='expense'&&<form className="fp-form" onSubmit={createExpense}>
          <h3>Registrar despesa</h3>
          <div className="fp-grid">
            <label>Data <FormControl type="date" value={expense.data_despesa}
              onChange={v=>setExpense(x=>({...x,data_despesa:v}))}/></label>
            <label>Categoria <FormControl type="select" value={expense.categoria_id}
              onChange={v=>setExpense(x=>({...x,categoria_id:v}))}
              options={(data?.categorias||[]).map(c=>({value:String(c.id),label:c.nome}))}
              placeholder="Selecione"/></label>
          </div>
          <label>Valor gasto (R$) <input inputMode="decimal" value={expense.valor}
            onChange={e=>setExpense(x=>({...x,valor:e.target.value}))} placeholder="Ex.: 45,00" required/></label>
          <label>Descrição <textarea maxLength={500} rows={2} value={expense.descricao}
            onChange={e=>setExpense(x=>({...x,descricao:e.target.value}))} placeholder="Ex.: Alimentação no clube" required/></label>
          <div className="fp-buttons"><button type="button" className="vd-outline" onClick={()=>setForm(null)}>Cancelar</button>
            <button className="cm-button primary" disabled={saving} type="submit">Registrar despesa</button></div>
        </form>}
        <section className="com-panel fp-list">
          <div className="com-panel-head"><div><h2>Despesas do período</h2><p>Cada pessoa responde apenas pelos seus gastos.</p></div></div>
          {expenses.length===0?<div className="com-empty">Nenhuma despesa cadastrada para o período.</div>:
          expenses.map(e=><article key={e.id} className={e.situacao==='CANCELADA'?'fp-cancelled':''}>
            <div><strong>{e.categoria_nome}</strong>
              <small>{dateBR(e.data_despesa)}{admin?' · '+e.pessoa_nome:''}</small>
              <small>{e.descricao}</small></div>
            <div className="fp-end"><strong>{brl(e.valor)}</strong>
              {e.situacao==='ATIVA'?<button type="button" className="vd-outline"
                onClick={()=>{setCancelId(e.id);setCancelReason('')}}>Cancelar</button>:
                <small>Cancelada</small>}</div>
            {cancelId===e.id&&<form className="fp-cancel" onSubmit={cancelExpense}>
              <label>Motivo do cancelamento
                <textarea rows={2} maxLength={500} value={cancelReason}
                  onChange={v=>setCancelReason(v.target.value)} required/></label>
              <div className="fp-buttons">
                <button className="vd-outline" type="button" onClick={()=>setCancelId(null)}>Voltar</button>
                <button className="cm-button primary" type="submit" disabled={saving}>Confirmar cancelamento</button>
              </div>
            </form>}
          </article>)}
        </section>
      </>:<>
        <div className="fp-stats">
          <div><span>Saldo de empréstimos</span><strong>{brl(loanBalance)}</strong></div>
          <div><span>Empréstimos registrados</span><strong>{loans.length}</strong></div>
        </div>
        {admin&&<div className="fp-actions">
          <button className="cm-button primary" type="button" onClick={()=>setForm(form==='loan'?null:'loan')}>+ Registrar empréstimo</button>
        </div>}
        {form==='loan'&&admin&&<form className="fp-form" onSubmit={createLoan}>
          <h3>Empréstimo recebido do clube</h3>
          <p className="fp-note">O empréstimo será lançado para a pessoa selecionada. Não haverá abatimento automático.</p>
          <label>Data <FormControl type="date" value={loan.data_emprestimo}
            onChange={v=>setLoan(x=>({...x,data_emprestimo:v}))}/></label>
          <label>Valor emprestado (R$) <input inputMode="decimal" value={loan.valor}
            onChange={e=>setLoan(x=>({...x,valor:e.target.value}))} placeholder="Ex.: 200,00" required/></label>
          <label>Descrição <textarea maxLength={500} rows={2} value={loan.descricao}
            onChange={e=>setLoan(x=>({...x,descricao:e.target.value}))} placeholder="Ex.: Empréstimo sem juros do clube" required/></label>
          <div className="fp-buttons"><button className="vd-outline" type="button" onClick={()=>setForm(null)}>Cancelar</button>
            <button className="cm-button primary" type="submit" disabled={saving}>Registrar empréstimo</button></div>
        </form>}
        <section className="com-panel fp-list">
          <div className="com-panel-head"><div><h2>Empréstimos e abatimentos</h2>
            <p>Os abatimentos efetuados em fechamentos aparecem no histórico.</p></div></div>
          {loans.length===0?<div className="com-empty">Nenhum empréstimo cadastrado.</div>:
          loans.map(l=><article key={l.id}>
            <div><strong>Empréstimo #{l.id}</strong>
              <small>{dateBR(l.data_emprestimo)}{admin?' · '+l.pessoa_nome:''}</small>
              <small>{l.descricao}</small>
              {l.abatimentos.length>0&&<div className="fp-history">{l.abatimentos.map(a=>
                <small key={a.id}>Abatimento {dateBR(a.data_abate)} · Acerto #{a.lote_id}: {brl(a.valor)}</small>)}</div>}
            </div>
            <div className="fp-end">
              <small>Valor {brl(l.valor)}</small>
              <small>Abatido {brl(l.abatido)}</small>
              <strong>Falta {brl(l.saldo)}</strong>
              {l.situacao==='CANCELADO'?<small>Cancelado: {l.justificativa_cancelamento}</small>:
                admin && l.abatimentos.length===0?<button type="button" className="vd-outline"
                  onClick={()=>{setCancelLoanId(l.id);setCancelReason('')}}>Cancelar empréstimo</button>:null}
            </div>
            {cancelLoanId===l.id&&<form className="fp-cancel" onSubmit={cancelLoan}>
              <label>Motivo do cancelamento do empréstimo
                <textarea rows={2} maxLength={500} value={cancelReason}
                  onChange={e=>setCancelReason(e.target.value)} required/></label>
              <div className="fp-buttons">
                <button type="button" className="vd-outline" onClick={()=>setCancelLoanId(null)}>Voltar</button>
                <button type="submit" className="cm-button primary" disabled={saving}>Confirmar cancelamento</button>
              </div>
            </form>}
          </article>)}
        </section>
      </>}
    </>}
  </div>
}
