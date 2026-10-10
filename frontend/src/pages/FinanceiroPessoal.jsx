import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import './FinanceiroPessoal.css'

const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const decimal=value=>{
  const raw=String(value??'').trim()
  const number=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(number)?number:null
}
const today=()=>localDateISO()

export default function FinanceiroPessoal({role='admin',tab='despesas',start,end,initialPerson='' }){
  const admin=role==='admin'
  const [person,setPerson]=useState(initialPerson)
  const [people,setPeople]=useState([])
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [modal,setModal]=useState(null)
  const [formError,setFormError]=useState('')
  const [owner,setOwner]=useState('')
  const [expense,setExpense]=useState({data_despesa:today(),categoria_id:'',valor:'',descricao:''})
  const [category,setCategory]=useState('')
  const [loan,setLoan]=useState({data_emprestimo:today(),valor:'',descricao:''})
  const [reason,setReason]=useState('')

  async function load(){
    const query=new URLSearchParams({inicio:start,fim:end})
    if(admin&&person)query.set('pessoa_id',person)
    const response=await comercialGet('/api/financeiro/pessoal?'+query)
    setData(response)
  }
  useEffect(()=>{
    if(!admin)return undefined
    let active=true
    comercialGet('/api/pessoas')
      .then(res=>{if(active)setPeople((res.pessoas||[]).filter(p=>p.ativo))})
      .catch(err=>{if(active)setError(err.message)})
    return ()=>{active=false}
  },[admin])
  useEffect(()=>{
    let active=true
    setLoading(true)
    const params=new URLSearchParams({inicio:start,fim:end})
    if(admin&&person)params.set('pessoa_id',person)
    comercialGet('/api/financeiro/pessoal?'+params)
      .then(res=>{if(active){setData(res);setError('')}})
      .catch(err=>{if(active)setError(err.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[admin,person,start,end])

  const persons=people.map(p=>({value:String(p.id),label:p.nome}))
  const owners=admin?persons:[]
  const categories=(data?.categorias||[]).filter(c=>
    c.pessoa_id===null||(!admin ? true : owner && String(c.pessoa_id)===String(owner))
  )
  const expenses=data?.despesas||[]
  const loans=data?.emprestimos||[]
  const expenseTotal=data?.resumo?.despesas_periodo||0
  const loanBalance=data?.resumo?.saldo_emprestimos||0
  function open(kind,row=null){
    const initial=String(row?.pessoa_id||person||'')
    setOwner(initial)
    setFormError('');setReason('')
    setModal({kind,id:row?.id??null})
    if(kind==='expense'){
      setExpense({data_despesa:row?.data_despesa||today(),
        categoria_id:String(row?.categoria_id||''),valor:row?.valor||'',descricao:row?.descricao||''})
    }
    if(kind==='loan'){
      setLoan({data_emprestimo:row?.data_emprestimo||today(),
        valor:row?.valor||'',descricao:row?.descricao||''})
    }
    if(kind==='category')setCategory('')
  }
  function close(){if(!saving){setModal(null);setFormError('')}}
  async function save(url,payload){
    setSaving(true);setFormError('')
    try{
      const response=await comercialPost(url,payload)
      setNotice(response.message||'Registro atualizado.')
      setModal(null);await load()
    }catch(err){setFormError(err.message)}
    finally{setSaving(false)}
  }
  const validOwner=()=>!admin||!!owner
  function submitExpense(e){
    e.preventDefault()
    const value=decimal(expense.valor)
    if(!validOwner())return setFormError('Selecione a pessoa responsável pela despesa.')
    if(!expense.categoria_id)return setFormError('Selecione uma categoria.')
    if(!value||Number(value)<=0)return setFormError('Informe um valor válido.')
    const payload={...expense,valor:value,categoria_id:Number(expense.categoria_id)}
    if(admin)payload.pessoa_id=Number(owner)
    save(modal.id?'/api/financeiro/despesas/'+modal.id+'/editar':'/api/financeiro/despesas',payload)
  }
  function submitLoan(e){
    e.preventDefault()
    if(!admin||!owner)return setFormError('Selecione quem recebeu o empréstimo.')
    const value=decimal(loan.valor)
    if(!value||Number(value)<=0)return setFormError('Informe um valor válido.')
    save(modal.id?'/api/financeiro/emprestimos/'+modal.id+'/editar':'/api/financeiro/emprestimos',
      {...loan,valor:value,pessoa_id:Number(owner)})
  }
  function submitCategory(e){
    e.preventDefault()
    if(!validOwner())return setFormError('Selecione a pessoa responsável pela categoria.')
    if(!category.trim())return setFormError('Informe o nome da categoria.')
    save('/api/financeiro/categorias',{nome:category.trim(),...(admin?{pessoa_id:Number(owner)}:{})})
  }
  function submitCancellation(e){
    e.preventDefault()
    if(reason.trim().length<5)return setFormError('Informe o motivo com pelo menos cinco caracteres.')
    const url=modal.kind==='cancelExpense'
      ?'/api/financeiro/despesas/'+modal.id+'/cancelar'
      :'/api/financeiro/emprestimos/'+modal.id+'/cancelar'
    save(url,{justificativa:reason.trim()})
  }
  const kind=modal?.kind
  const caption=kind==='category'?'Nova categoria':
    kind==='expense'?(modal.id?'Editar despesa':'Nova despesa'):
    kind==='loan'?(modal.id?'Editar empréstimo':'Novo empréstimo'):
    'Confirmar cancelamento'
  const ownerField=admin&&['expense','loan','category'].includes(kind)
  return <div className="fp-main">
    <div className="fp-header">
      <div><h2>{tab==='despesas'?'Despesas':'Empréstimos'}</h2>
        <p>{tab==='despesas'
          ?'Gastos, categorias e correções individuais. Não são descontados automaticamente das comissões.'
          :'Dívidas por pessoa, com valor emprestado, abatimentos negociados e saldo.'}</p></div>
      {admin&&<label>Consultar conta
        <FormControl type="select" value={person} onChange={setPerson}
          options={[{value:'',label:'Todas as pessoas'},...persons]}/></label>}
    </div>
    {notice&&<div className="com-alert success" role="status">{notice}
      <button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}
      <button type="button" onClick={()=>setError('')}>Fechar</button></div>}
    {loading?<div className="com-panel"><div className="com-empty">Carregando lançamentos...</div></div>:tab==='despesas'?<>
      <div className="fp-stats">
        <div><span>Despesas ativas no período</span><strong>{brl(expenseTotal)}</strong></div>
        <div><span>Lançamentos ativos</span><strong>{expenses.filter(e=>e.situacao==='ATIVA').length}</strong></div>
      </div>
      <div className="fp-actions">
        <button type="button" className="cm-button primary" onClick={()=>open('expense')}>+ Nova despesa</button>
        <button type="button" className="vd-outline" onClick={()=>open('category')}>+ Categoria</button>
      </div>
      <section className="com-panel fp-list">
        <div className="com-panel-head"><div><h2>Despesas registradas</h2>
          <p>Valores por categoria, data e responsável.</p></div></div>
        {!expenses.length?<div className="com-empty">Nenhuma despesa no período.</div>:
          expenses.map(item=><article key={item.id} className={item.situacao==='CANCELADA'?'fp-cancelled':''}>
            <div><strong>{item.categoria_nome}</strong>
              <small>{dateBR(item.data_despesa)}{admin?' · '+item.pessoa_nome:''}</small>
              <small>{item.descricao}</small>
              {item.situacao==='CANCELADA'&&<small>Cancelada: {item.justificativa_cancelamento||'Ver histórico'}</small>}
            </div>
            <div className="fp-end">
              <strong>{brl(item.valor)}</strong>
              {item.situacao==='ATIVA'&&<div className="fp-row-actions">
                <button type="button" className="vd-outline" onClick={()=>open('expense',item)}>Editar</button>
                <button type="button" className="vd-outline" onClick={()=>open('cancelExpense',item)}>Cancelar</button>
              </div>}
            </div>
          </article>)}
      </section>
    </>:<>
      <div className="fp-stats">
        <div><span>Saldo de empréstimos</span><strong>{brl(loanBalance)}</strong></div>
        <div><span>Empréstimos registrados</span><strong>{loans.length}</strong></div>
      </div>
      {admin&&<div className="fp-actions">
        <button type="button" className="cm-button primary" onClick={()=>open('loan')}>+ Novo empréstimo</button>
      </div>}
      <section className="com-panel fp-list">
        <div className="com-panel-head"><div><h2>Empréstimos e abatimentos</h2>
          <p>Os pagamentos de dívidas são lançados exclusivamente no fechamento.</p></div></div>
        {!loans.length?<div className="com-empty">Nenhum empréstimo registrado.</div>:
          loans.map(item=><article key={item.id} className={item.situacao==='CANCELADO'?'fp-cancelled':''}>
            <div><strong>Empréstimo #{item.id}</strong>
              <small>{dateBR(item.data_emprestimo)}{admin?' · '+item.pessoa_nome:''}</small>
              <small>{item.descricao}</small>
              {item.situacao==='CANCELADO'&&<small>Cancelado: {item.justificativa_cancelamento}</small>}
              {!!item.abatimentos?.length&&<div className="fp-history">
                {item.abatimentos.map(a=><small key={a.id}>
                  Abatimento {dateBR(a.data_abate)} · Fechamento #{a.lote_id}: {brl(a.valor)}
                </small>)}
              </div>}
            </div>
            <div className="fp-end">
              <small>Emprestado: {brl(item.valor)}</small>
              <small>Já abatido: {brl(item.abatido)}</small>
              <strong>Falta: {brl(item.saldo)}</strong>
              {admin&&item.situacao==='ATIVO'&&!item.abatimentos?.length&&<div className="fp-row-actions">
                <button type="button" className="vd-outline" onClick={()=>open('loan',item)}>Editar</button>
                <button type="button" className="vd-outline" onClick={()=>open('cancelLoan',item)}>Cancelar</button>
              </div>}
            </div>
          </article>)}
      </section>
    </>}
    {modal&&<SurfaceModal eyebrow="SPLASH / FINANCEIRO" title={caption} busy={saving} onClose={close}
      subtitle={ownerField?'O lançamento será associado à pessoa selecionada.':undefined}>
      {kind==='expense'&&<form className="fp-form fp-modal-form" onSubmit={submitExpense}>
        {ownerField&&<label>Responsável pela despesa *
          <FormControl type="select" value={owner} disabled={!!modal.id} onChange={v=>{
            setOwner(v);setExpense(x=>({...x,categoria_id:''}))
          }} options={owners} placeholder="Selecione uma pessoa" /></label>}
        <div className="fp-grid">
          <label>Data * <FormControl type="date" value={expense.data_despesa}
            onChange={v=>setExpense(x=>({...x,data_despesa:v}))}/></label>
          <label>Categoria * <FormControl type="select" value={expense.categoria_id}
            onChange={v=>setExpense(x=>({...x,categoria_id:v}))}
            options={categories.map(c=>({value:String(c.id),label:c.nome}))}
            placeholder="Selecione a categoria"/></label>
        </div>
        <label>Valor (R$) * <input inputMode="decimal" value={expense.valor}
          onChange={e=>setExpense(x=>({...x,valor:e.target.value}))} placeholder="Ex.: 45,00" required/></label>
        <label>Descrição * <textarea rows={3} maxLength={500} value={expense.descricao}
          onChange={e=>setExpense(x=>({...x,descricao:e.target.value}))} required/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="fp-buttons"><button className="vd-outline" type="button" onClick={close}>Cancelar</button>
          <button className="cm-button primary" disabled={saving||!validOwner()} type="submit">
            {modal.id?'Salvar alterações':'Registrar despesa'}</button></div>
      </form>}
      {kind==='category'&&<form className="fp-form fp-modal-form" onSubmit={submitCategory}>
        {ownerField&&<label>Categoria para * <FormControl type="select" value={owner}
          onChange={setOwner} options={owners} placeholder="Selecione uma pessoa"/></label>}
        <label>Nome * <input value={category} maxLength={90} required
          onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Bonificações"/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="fp-buttons"><button type="button" className="vd-outline" onClick={close}>Cancelar</button>
          <button type="submit" disabled={saving||!validOwner()} className="cm-button primary">Salvar categoria</button></div>
      </form>}
      {kind==='loan'&&<form className="fp-form fp-modal-form" onSubmit={submitLoan}>
        {ownerField&&<label>Quem recebeu o empréstimo * <FormControl type="select"
          value={owner} disabled={!!modal.id} onChange={setOwner}
          options={owners} placeholder="Selecione a pessoa"/></label>}
        <label>Data * <FormControl type="date" value={loan.data_emprestimo}
          onChange={v=>setLoan(x=>({...x,data_emprestimo:v}))}/></label>
        <label>Valor emprestado (R$) * <input inputMode="decimal" value={loan.valor} required
          onChange={e=>setLoan(x=>({...x,valor:e.target.value}))} placeholder="Ex.: 200,00"/></label>
        <label>Descrição * <textarea rows={3} maxLength={500} value={loan.descricao} required
          onChange={e=>setLoan(x=>({...x,descricao:e.target.value}))}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="fp-buttons"><button className="vd-outline" type="button" onClick={close}>Cancelar</button>
          <button type="submit" disabled={saving||!validOwner()} className="cm-button primary">
            {modal.id?'Salvar alterações':'Registrar empréstimo'}</button></div>
      </form>}
      {(kind==='cancelExpense'||kind==='cancelLoan')&&<form className="fp-form fp-modal-form" onSubmit={submitCancellation}>
        <p className="fp-note">O registro permanecerá no histórico para auditoria.</p>
        <label>Justificativa * <textarea rows={3} maxLength={500} value={reason} required
          onChange={e=>setReason(e.target.value)} placeholder="Informe o motivo do cancelamento"/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="fp-buttons"><button className="vd-outline" type="button" onClick={close}>Voltar</button>
          <button type="submit" className="cm-button primary" disabled={saving}>Confirmar cancelamento</button></div>
      </form>}
    </SurfaceModal>}
  </div>
}
