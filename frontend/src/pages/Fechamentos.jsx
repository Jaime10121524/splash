import {useEffect,useMemo,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import Financeiro from './Financeiro.jsx'
import './ComercialPages.css'
import './Fechamentos.css'

const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0))
const numeric=v=>{
  const s=String(v??'').trim()
  const t=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(t)?t:null
}
const roles=[{value:'CORRETOR',label:'Corretor'},{value:'ATENDENTE',label:'Atendente'},{value:'GERENTE',label:'Gerente'}]
const week=()=>{
  const current=new Date(),dow=(current.getDay()+6)%7
  const monday=new Date(current.getFullYear(),current.getMonth(),current.getDate()-dow)
  const sunday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6)
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
  return [iso(monday),iso(sunday)]
}
const newRow=(root)=>({responsavel_pessoa_id:String(root),beneficiario_pessoa_id:'',papel:'ATENDENTE',valor:'',observacoes:''})

export default function Fechamentos({role='admin'}){
  const admin=role==='admin'
  const [defaultStart,defaultEnd]=useMemo(week,[])
  const [start,setStart]=useState(defaultStart)
  const [end,setEnd]=useState(defaultEnd)
  const [report,setReport]=useState(null)
  const [accounts,setAccounts]=useState([])
  const [settlements,setSettlements]=useState([])
  const [showSales,setShowSales]=useState(false)
  const [openPersons,setOpenPersons]=useState({})
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [dialog,setDialog]=useState(null)
  const [formError,setFormError]=useState('')
  const [items,setItems]=useState([])
  const [reason,setReason]=useState('')
  const [amount,setAmount]=useState('')
  const [date,setDate]=useState(localDateISO())
  const [detail,setDetail]=useState(null)
  const [suggestion,setSuggestion]=useState(5)
  const [policy,setPolicy]=useState(null)
  const [holiday,setHoliday]=useState({data:localDateISO(),descricao:''})
  const [holidays,setHolidays]=useState([])
  const [paymentMethods,setPaymentMethods]=useState([])
  const [methodId,setMethodId]=useState('')
  const [batchEntries,setBatchEntries]=useState([])
  const [batchKey,setBatchKey]=useState('')
  const [planOverrides,setPlanOverrides]=useState([])
  const [removingOverride,setRemovingOverride]=useState(null)
  const [planCatalog,setPlanCatalog]=useState([])
  const [override,setOverride]=useState({
    plano_versao_id:'',modalidade:'TODOS',tipo_dia:'OUTROS',
    papel:'ATENDENTE',tipo_calculo:'FIXO',valor:'',observacoes:'',
  })

  async function reload(){
    if(!start||!end||start>end)throw new Error('Selecione início e fim válidos.')
    const endpoint=admin?'resumo':'meu'
    const query='?'+new URLSearchParams({inicio:start,fim:end})
    if(admin){
      const [data,accountData,forms]=await Promise.all([
        comercialGet('/api/fechamentos/'+endpoint+query),
        comercialGet('/api/fechamentos/contas'+query),
        comercialGet('/api/fechamentos/formas'),
      ])
      setReport(data);setAccounts(accountData.contas||[])
      setSettlements(accountData.acertos||[])
      setPaymentMethods(forms.formas||[])
    } else {
      const [data,accountData]=await Promise.all([
        comercialGet('/api/fechamentos/'+endpoint+query),
        comercialGet('/api/fechamentos/contas'+query),
      ])
      setReport(data);setAccounts(accountData.contas||[])
    }
  }
  useEffect(()=>{
    if(!admin)return
    let active=true
    setLoading(true)
    reload().then(()=>{if(active)setError('')})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[admin,start,end])

  const people=report?.pessoas||[]
  const peopleOptions=people.map(p=>({value:String(p.id),label:p.nome+(!Number(p.ativo)?' (inativo)':'')}))
  const personName=id=>people.find(p=>Number(p.id)===Number(id))?.nome||'Pessoa #'+id
  const totalSales=(report?.operacoes||[]).reduce((a,o)=>a+(o.comissao_base!==null?Number(o.comissao_base):0),0)
  const pendingSales=(report?.operacoes||[]).filter(o=>o.comissao_base===null).length
  const totals=accounts.reduce((r,a)=>({
    due:r.due+Number(a.resumo.total),
    paid:r.paid+Number(a.resumo.pago),
    pending:r.pending+Number(a.resumo.pendente),
  }),{due:0,paid:0,pending:0})
  const openOwnPayment=line=>{
    setMethodId(String(paymentMethods.find(m=>m.codigo==='PIX')?.id||paymentMethods[0]?.id||''))
    setAmount(Number(line.pendente).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
    setReason('');setDate(localDateISO());setFormError('')
    setDialog({type:'ownerPayment',line})
  }
  const recordOwnPayment=async(event)=>{
    event.preventDefault()
    const value=numeric(amount)
    if(!value||Number(value)<=0)return setFormError('Informe um valor válido.')
    if(reason.trim().length<5)return setFormError('Explique o pagamento em pelo menos cinco caracteres.')
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/titular/'+dialog.line.operacao_id+'/pagar',{
        valor:value,data_pagamento:date,observacoes:reason.trim(),forma_id:Number(methodId),
      })
      setNotice(result.message);setDialog(null)
      await reload()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  const reverseOwnPayment=async(event)=>{
    event.preventDefault()
    if(reason.trim().length<5)return setFormError('Informe o motivo do estorno.')
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/titular/movimentos/'+dialog.move.id+'/estornar',{
        justificativa:reason.trim(),
      })
      setNotice(result.message);setDialog(null)
      await reload()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  function openRateios(op){
    setItems(op.rateios.length?op.rateios.map(a=>({
      responsavel_pessoa_id:String(a.responsavel_pessoa_id),
      beneficiario_pessoa_id:String(a.beneficiario_pessoa_id),
      papel:a.papel,valor:Number(a.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),
      observacoes:a.observacoes||'',
    })):[newRow(op.corretor_pessoa_id)])
    setReason('');setFormError('');setSuggestion(5)
    setDialog({type:'rateios',op})
  }
  const changeItem=(idx,key,value)=>setItems(old=>old.map((r,i)=>i===idx?{...r,[key]:value}:r))
  const allocationTotal=items.reduce((a,x)=>a+(Number(numeric(x.valor))||0),0)
  const suggestedValue=dialog?.op?.valor_tabela?money(Number(dialog.op.valor_tabela)*suggestion/100):'—'

  async function saveRateios(event){
    event.preventDefault()
    if(reason.trim().length<5)return setFormError('Informe uma justificativa com pelo menos cinco caracteres.')
    const cleaned=[]
    for(const r of items){
      const value=numeric(r.valor)
      if(!value || Number(value)<=0 || !r.responsavel_pessoa_id || !r.beneficiario_pessoa_id)
        return setFormError('Revise pessoas e valores positivos em todas as participações.')
      cleaned.push({
        responsavel_pessoa_id:Number(r.responsavel_pessoa_id),
        beneficiario_pessoa_id:Number(r.beneficiario_pessoa_id),
        papel:r.papel,valor:value,observacoes:r.observacoes,
      })
    }
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/operacoes/'+dialog.op.id+'/rateios',{
        itens:cleaned,justificativa:reason.trim(),
      })
      setNotice(result.message);setDialog(null);await reload()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function openLedger(rateio,type='ledger'){
    setBusy(true);setFormError('')
    setMethodId(String(paymentMethods.find(m=>m.codigo==='PIX')?.id||paymentMethods[0]?.id||''))
    try{
      const data=await comercialGet('/api/fechamentos/rateios/'+rateio.id)
      setDetail(data);setDate(localDateISO())
      setAmount(Number(rateio.pendente).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
      setReason('');setDialog({type,rateio})
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function pay(event){
    event.preventDefault()
    const value=numeric(amount)
    if(!value || Number(value)<=0)return setFormError('Informe um valor positivo.')
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/rateios/'+dialog.rateio.id+'/pagar',{
        valor:value,data_pagamento:date,observacoes:reason,forma_id:Number(methodId),
      })
      setNotice(result.message)
      await reload()
      const data=await comercialGet('/api/fechamentos/rateios/'+dialog.rateio.id)
      setDetail(data);setDialog({type:'ledger',rateio:dialog.rateio})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function reverse(event){
    event.preventDefault()
    if(reason.trim().length<5)return setFormError('Informe a justificativa do estorno.')
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/repasses/'+dialog.move.id+'/estornar',{
        justificativa:reason.trim(),
      })
      setNotice(result.message)
      await reload()
      const data=await comercialGet('/api/fechamentos/rateios/'+dialog.rateio.id)
      setDetail(data);setDialog({type:'ledger',rateio:dialog.rateio})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function syncSales(){
    if(!admin)return
    setBusy(true);setError('');setNotice('')
    try{
      const result=await comercialPost('/api/fechamentos/sincronizar',{inicio:start,fim:end})
      const r=result.resultado||{}
      setNotice('Participações automáticas: '+(r.geradas||0)+' novas, '+(r.existentes||0)+' existentes, '+(r.revisar||0)+' para revisão, '+(r.aguardando||0)+' aguardando quitação.')
      await reload()
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function openPolicies(){
    setBusy(true);setFormError('')
    try{
      const result=await comercialGet('/api/fechamentos/politica')
      setPolicy(result.politica);setHolidays(result.feriados||[])
      setPlanOverrides(result.excecoes||[]);setPlanCatalog(result.planos||[])
      setDialog({type:'policy'})
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function savePolicy(e){
    e.preventDefault();setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/politica',policy)
      setNotice(result.message);setDialog(null)
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function saveHoliday(e){
    e.preventDefault();setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/feriados',holiday)
      setNotice(result.message)
      const refreshed=await comercialGet('/api/fechamentos/politica')
      setHolidays(refreshed.feriados||[])
      setPlanOverrides(refreshed.excecoes||[]);setPlanCatalog(refreshed.planos||[])
      setHoliday({data:localDateISO(),descricao:''})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  async function saveOverride(event){
    event.preventDefault();setBusy(true);setFormError('')
    const value=numeric(override.valor)
    if(!value || Number(value)<=0){setBusy(false);setFormError('Informe valor fixo ou percentual maior que zero.');return}
    try{
      const result=await comercialPost('/api/fechamentos/excecoes',{...override,valor:value,
        plano_versao_id:Number(override.plano_versao_id)})
      setNotice(result.message)
      const refreshed=await comercialGet('/api/fechamentos/politica')
      setPlanOverrides(refreshed.excecoes||[])
      setOverride(x=>({...x,valor:'',observacoes:''}))
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function removeOverride(id){
    if(removingOverride!==id){setRemovingOverride(id);return}
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/fechamentos/excecoes/'+id+'/excluir',{})
      setNotice(result.message)
      const refreshed=await comercialGet('/api/fechamentos/politica')
      setPlanOverrides(refreshed.excecoes||[])
      setRemovingOverride(null)
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  const newKey=()=> (typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():
    String(Date.now())+'_'+Math.random().toString(36).slice(2,12))
  function openBatch(person){
    setFormError('');setDate(localDateISO());setReason('')
    const initial=paymentMethods.find(f=>f.codigo==='PIX')||paymentMethods[0]
    setBatchEntries([{forma_id:String(initial?.id||''),valor:''}])
    setBatchKey(newKey())
    setMethodId(String(initial?.id||''))
    setDialog({type:'batch',person})
  }
  function updateBatch(index,field,value){
    setBatchEntries(old=>old.map((item,i)=>i===index?{...item,[field]:value}:item))
  }
  const batchSum=batchEntries.reduce((sum,item)=>sum+(Number(numeric(item.valor))||0),0)
  async function saveBatch(event){
    event.preventDefault()
    const person=dialog.person
    if(!batchEntries.length||batchEntries.some(x=>!x.forma_id||!numeric(x.valor)||Number(numeric(x.valor))<=0)){
      return setFormError('Informe a forma e o valor de cada parte do pagamento.')
    }
    if(batchSum>Number(person.resumo.pendente)+0.00001)return setFormError('O acerto supera o saldo pendente da pessoa.')
    setBusy(true);setFormError('')
    try{
      const payload={
        chave_requisicao:batchKey,pessoa_id:Number(person.pessoa_id),inicio:start,fim:end,
        data_pagamento:date,observacoes:reason,
        formas:batchEntries.map(x=>({forma_id:Number(x.forma_id),valor:numeric(x.valor)})),
      }
      const result=await comercialPost('/api/fechamentos/pagamentos-lote',payload)
      setNotice(result.message+' '+money(result.valor_total||batchSum)+' distribuídos nas vendas desta pessoa.')
      setDialog(null);await reload()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  const nameOfPlan=id=>{
    const p=planCatalog.find(x=>String(x.id)===String(id))
    return p? p.codigo+' · '+money(p.valor)+' · '+(Number(p.duracao_meses)/12)+' ano(s)':'Plano #'+id
  }
  const title=admin?'Fechamentos':'Meu financeiro'
  if(!admin)return <Financeiro role={role}/>
  return <div className="com-page fc-page">
    <header className="com-heading">
      <div><span className="com-eyebrow">SPLASH / FECHAMENTOS</span><h1>{title}</h1>
        <p>{admin?'Confira quanto pagar a cada pessoa, o que já foi pago e o que ainda está pendente.':'Suas comissões apuradas, sem acesso às demais contas.'}</p></div>
      {admin&&<div className="fc-header-buttons">
        <button className="vd-outline" type="button" disabled={busy} onClick={openPolicies}>Regras e feriados</button>
        <button className="com-main-button" type="button" disabled={busy} onClick={syncSales}>{busy?'Apurando...':'Apurar vendas anteriores'}</button>
      </div>}
    </header>
    {notice&&<div className="com-alert success" role="status">{notice}
      <button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}
      <button type="button" onClick={()=>{setError('');reload().catch(e=>setError(e.message))}}>Tentar novamente</button></div>}
    <section className="com-panel fc-filter-panel">
      <div className="fc-period">
        <label>Data inicial <FormControl type="date" value={start} onChange={setStart}/></label>
        <label>Data final <FormControl type="date" value={end} onChange={setEnd}/></label>
        <button type="button" className="vd-outline" onClick={()=>{const [a,b]=week();setStart(a);setEnd(b)}}>Semana atual</button>
      </div>
      <small>Apuração pela data da venda. O período pode ser alterado e cada pessoa conserva seus próprios saldos.</small>
    </section>
    {loading?<section className="com-panel"><div className="com-empty">Carregando apuração...</div></section>:
    !admin&&report?<section className="com-panel">
      <div className="com-panel-head"><div><h2>{report.pessoa?.nome}</h2><p>Resumo exclusivamente individual</p></div></div>
      <div className="fc-stats">
        <div><span>Comissões das próprias vendas</span><strong>{money(report.resumo.comissoes_proprias)}</strong></div>
        <div><span>Rateios que devo pagar</span><strong>{money(report.resumo.obrigacoes_de_rateio)}</strong></div>
        <div><span>Participações recebidas de outros</span><strong>{money(report.resumo.direitos_de_terceiros)}</strong></div>
        <div><span>Participação líquida prevista</span><strong>{money(report.resumo.participacao_liquida_prevista)}</strong></div>
        <div><span>Rateios que já me pagaram</span><strong>{money(report.resumo.rateios_ja_pagos_a_mim)}</strong></div>
        <div><span>Rateios que faltam me pagar</span><strong>{money(report.resumo.rateios_pendentes_para_mim)}</strong></div>
      </div>
      <p className="com-disclaimer">{report.aviso}</p>
    </section>:admin&&report?<>
      <section className="fc-stats">
        <div><span>Total a pagar às pessoas</span><strong>{money(totals.due)}</strong></div>
        <div><span>Já pago (registrado)</span><strong>{money(totals.paid)}</strong></div>
        <div><span>Ainda falta pagar</span><strong>{money(totals.pending)}</strong></div>
      </section>
      <section className="com-panel fc-breakdown">
        <div className="com-panel-head"><div><h2>Quanto pagar a cada pessoa</h2>
          <p>Abra uma pessoa para conferir cada venda ou atendimento e marcar somente o pagamento que realmente aconteceu.</p></div>
          <span className="com-count">{accounts.length} contas</span></div>
        {!accounts.length?<div className="com-empty">Nenhuma comissão já apurada no período. Vendas incompletas ainda não entram nos valores.</div>:
        <div className="fc-person-strip">{accounts.map(person=>{
          const open=!!openPersons[person.pessoa_id]
          return <article className="fc-person-card" key={person.pessoa_id}>
            <div className="fc-person-top">
              <div><strong>{person.nome}</strong><small>{person.itens.length} participações de vendas</small></div>
              <div className="fc-person-actions">
                <button type="button" className="cm-button primary"
                  disabled={busy || Number(person.resumo.pendente)<=0}
                  onClick={()=>openBatch(person)}>Registrar acerto da pessoa</button>
                <button type="button" className="vd-outline" aria-expanded={open}
                  onClick={()=>setOpenPersons(p=>({...p,[person.pessoa_id]:!p[person.pessoa_id]}))}>
                  {open?'Ocultar vendas':'Ver vendas'}
                </button>
              </div>
            </div>
            <div className="fc-person-stats">
              <div><span>Total devido</span><strong>{money(person.resumo.total)}</strong></div>
              <div><span>Já pago</span><strong>{money(person.resumo.pago)}</strong></div>
              <div><span>Falta pagar</span><strong className="fc-outstanding">{money(person.resumo.pendente)}</strong></div>
            </div>
            {open&&<div className="fc-person-lines">
              {person.itens.map((line,i)=><div className="fc-person-line"
                key={line.tipo+'-'+line.operacao_id+'-'+(line.rateio_id||0)+'-'+i}>
                <div className="fc-person-line-info">
                  <strong>{line.descricao}</strong>
                  <small>Venda {line.titulo||'#'+line.operacao_id} · {dateBR(line.data_venda)}
                    {line.visita_id?' · Atendimento #'+line.visita_id:''}</small>
                  {line.cliente_nome&&<small>Cliente: {line.cliente_nome}</small>}
                  <small>Total: {money(line.total)} · Já pago: {money(line.pago)}</small>
                  {!!line.movimentos.length&&<small>{line.movimentos.length} movimentação(ões) no histórico</small>}
                </div>
                <div className="fc-person-line-actions">
                  <span>Falta {money(line.pendente)}</span>
                  {line.tipo==='TITULAR'
                    ?<button type="button" className="vd-outline" onClick={()=>openOwnPayment(line)}>
                      {Number(line.pendente)>0?'Registrar pagamento':'Ver pagamentos'}
                    </button>
                    :<button type="button" className="vd-outline"
                      onClick={()=>openLedger({
                        id:line.rateio_id,
                        beneficiario_nome:person.nome,
                        pendente:line.pendente,
                      })}>Extrato / pagar</button>}
                </div>
              </div>)}
              {Number(person.resumo.a_repassar)>0&&
                <div className="fc-person-line"><small>A repassar a terceiros: {money(person.resumo.a_repassar)} · Já repassou: {money(person.resumo.repasses_ja_pagos)}</small></div>}
            </div>}
          </article>
        })}</div>}
      </section>
      <section className="com-panel fc-settlements">
        <div className="com-panel-head"><div><h2>Acertos registrados</h2>
          <p>Pagamentos consolidados por pessoa, com as formas utilizadas. Estornos posteriores aparecem no extrato das participações.</p></div></div>
        {!settlements.length?<div className="com-empty">Nenhum acerto consolidado registrado neste período.</div>:
        <div className="fc-settlements-list">{settlements.map(item=><article key={item.id}>
          <div><strong>{item.pessoa_nome}</strong>
            <small>Acerto #{item.id} · {dateBR(item.data_pagamento)} · Vendas de {dateBR(item.periodo_inicio)} a {dateBR(item.periodo_fim)}</small>
            {item.observacoes&&<small>{item.observacoes}</small>}
            <div className="fc-settlement-methods">{item.formas.map((f,i)=><span key={i}>{f.forma}: {money(f.valor)}</span>)}</div>
          </div>
          <strong>{money(item.valor_total)}</strong>
        </article>)}</div>}
      </section>
      <div className="fc-sales-toggle">
        <button type="button" className="vd-outline" onClick={()=>setShowSales(v=>!v)}
          aria-expanded={showSales}>{showSales?'Ocultar conferência por venda':'Conferir / corrigir rateios por venda'}</button>
        <small>{pendingSales>0?pendingSales+' vendas aguardando apuração. ':''}Rateios e exceções podem ser ajustados antes de registrar o pagamento.</small>
      </div>
      {showSales&&<section className="com-panel">
        <div className="com-panel-head"><div><h2>Conferir participação por venda</h2><p>Use somente quando precisar mudar as divisões automáticas.</p></div><span className="com-count">{report.operacoes.length} vendas</span></div>
        {report.operacoes.length===0?<div className="com-empty">Nenhuma venda registrada para as datas.</div>:
        <div className="fc-sales">{report.operacoes.map(op=><article key={op.id}>
          <div className="fc-sale-top">
            <div><strong>{op.cliente_nome}</strong><small>{op.numero_titulo?op.numero_titulo+' '+op.sigla_plano:'Título não informado'} · {dateBR(op.data_venda)} · Corretor: {op.corretor_nome}</small></div>
            <div className="fc-sale-total"><span>Comissão {op.comissao_ajustada!==null?'ajustada':'apurada'}</span>
              <strong>{op.comissao_base===null?'A calcular':money(op.comissao_base)}</strong></div>
          </div>
          {op.apuracao_automatica?.status==='REVISAR'&&
            <p className="fc-hint fc-review">Rateio automático precisa de revisão: {op.apuracao_automatica.observacoes}</p>}
          {op.apuracao_automatica?.status==='GERADO'&&
            <p className="fc-hint">Participações geradas automaticamente. Confira os valores antes de registrar pagamentos.</p>}
          {op.comissao_base===null?<p className="fc-hint">Pagamento do título incompleto ou regra sem apuração. Não é possível distribuir ainda.</p>:
          <>
            <p className="fc-hint">Parte prevista do corretor {op.corretor_nome}: <strong>{money(op.saldo_corretor_base)}</strong>, após participações registradas. Não representa pagamento recebido.</p>
            <div className="fc-allocations">
              {op.rateios.length?op.rateios.map(r=><div key={r.id} className="fc-allocation">
                <div><strong>{r.beneficiario_nome}</strong>
                  <small>{r.papel} · Pago por: {r.origem_nome}</small></div>
                <div><strong>{money(r.valor)}</strong><small>Pago: {money(r.pago)} · Falta: {money(r.pendente)}</small></div>
                <button type="button" className="vd-outline" onClick={()=>openLedger(r)}>Extrato / pagar</button>
              </div>):<p className="fc-hint">Ainda sem rateio. A comissão pertence inicialmente a {op.corretor_nome}.</p>}
            </div>
            <div className="fc-sale-actions"><button type="button" className="cm-button"
              onClick={()=>openRateios(op)}>Definir participações</button></div>
          </>}
        </article>)}</div>}
      </section>}
      <p className="com-disclaimer">{report.aviso} O rateio não transfere dinheiro por si só; ao registrar um pagamento, confirme que ele realmente foi feito.</p>
    </>:null}
    {dialog&&<SurfaceModal
      eyebrow="SPLASH / FINANCEIRO"
      title={dialog.type==='batch'?'Acerto semanal por pessoa':dialog.type==='policy'?'Regras automáticas e feriados':
        dialog.type==='ownerPayment'?'Pagamentos da comissão do corretor':
        dialog.type==='ownerReverse'?'Estornar pagamento do corretor':
        dialog.type==='rateios'?'Distribuir comissão':dialog.type==='pay'?'Registrar repasse':
        dialog.type==='reverse'?'Estornar repasse':'Extrato do participante'}
      subtitle={dialog.type==='batch'?dialog.person.nome:dialog.type==='rateios'?dialog.op.cliente_nome:dialog.rateio?.beneficiario_nome}
      busy={busy} onClose={()=>setDialog(null)}>
      {dialog.type==='batch'&&<form className="cm-form fc-batch-form" onSubmit={saveBatch}>
        <div className="com-inform">Você paga uma única vez por pessoa. O SPLASH distribui os valores pelas vendas mais antigas com saldo pendente, preservando em cada venda quanto foi Pix, dinheiro ou outro meio. Nada é marcado pago antes de confirmar.</div>
        <div className="fc-stats fc-ledger-summary">
          <div><span>Comissões</span><strong>{money(dialog.person.resumo.total)}</strong></div>
          <div><span>Já recebeu</span><strong>{money(dialog.person.resumo.pago)}</strong></div>
          <div><span>Falta receber</span><strong>{money(dialog.person.resumo.pendente)}</strong></div>
        </div>
        <label>Data do acerto <FormControl type="date" value={date} onChange={setDate}/></label>
        <div className="fc-batch-methods">
          <strong>Como a pessoa recebeu?</strong>
          {batchEntries.map((entry,i)=><div className="fc-batch-row" key={i}>
            <label>Forma de pagamento
              <FormControl type="select" value={entry.forma_id}
                onChange={v=>updateBatch(i,'forma_id',v)}
                options={paymentMethods.map(m=>({value:String(m.id),label:m.nome}))}
                placeholder="Selecione"/></label>
            <label>Valor (R$)
              <input type="text" inputMode="decimal" value={entry.valor}
                onChange={e=>updateBatch(i,'valor',e.target.value)}
                placeholder="Ex.: 40,00"/></label>
            <button className="vd-outline" type="button"
              disabled={batchEntries.length===1}
              onClick={()=>setBatchEntries(entries=>entries.filter((_,j)=>j!==i))}>Retirar</button>
          </div>)}
          <button type="button" className="vd-outline" disabled={batchEntries.length>=10}
            onClick={()=>setBatchEntries(entries=>[...entries,{forma_id:String(paymentMethods[0]?.id||''),valor:''}])}>+ Outra forma de pagamento</button>
        </div>
        <div className="fc-batch-total">
          <span>Total deste pagamento</span><strong>{money(batchSum)}</strong>
          <small>Saldo disponível {money(dialog.person.resumo.pendente)}. Você pode pagar só uma parte agora.</small>
        </div>
        <label>Observações (opcional)
          <textarea maxLength={500} rows={2} value={reason}
            onChange={e=>setReason(e.target.value)} placeholder="Ex.: Fechamento de domingo"/></label>
        <div className="fc-batch-sales">
          <strong>Vendas que receberão a baixa (da mais antiga para a recente)</strong>
          {[...dialog.person.itens].filter(x=>Number(x.pendente)>0)
            .sort((a,b)=>a.data_venda.localeCompare(b.data_venda)||a.operacao_id-b.operacao_id)
            .map((line,i)=><div key={i}>
              <span>{line.descricao} · {line.titulo||'#'+line.operacao_id}</span>
              <strong>Falta {money(line.pendente)}</strong>
            </div>)}
        </div>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions">
          <button type="button" className="cm-button" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button>
          <button type="submit" className="cm-button primary"
            disabled={busy || batchSum<=0 || batchSum>Number(dialog.person.resumo.pendente)+0.00001}>
            {busy?'Registrando...':'Confirmar pagamento à pessoa'}</button>
        </div>
      </form>}
      {dialog.type==='ownerPayment'&&<div className="cm-form">
        <div className="com-inform">Parte própria do corretor depois das participações. Somente registre dinheiro que ele realmente recebeu ou reteve, inclusive quando a comissão ficou no Pix. Este registro não transfere dinheiro automaticamente.</div>
        <div className="fc-stats fc-ledger-summary">
          <div><span>Total devido</span><strong>{money(dialog.line.total)}</strong></div>
          <div><span>Já recebeu</span><strong>{money(dialog.line.pago)}</strong></div>
          <div><span>Falta pagar</span><strong>{money(dialog.line.pendente)}</strong></div>
        </div>
        <div className="fc-ledger-moves">
          {dialog.line.movimentos.length?dialog.line.movimentos.map(m=><div key={m.id}>
            <div><strong>{m.tipo==='PAGAMENTO'?'Pagamento registrado':'Estorno de registro'}</strong>
              <small>{dateBR(m.data)} · {m.forma_nome||'Forma não informada'} · {m.observacoes||'Sem observação'}</small></div>
            <div><strong>{m.tipo==='PAGAMENTO'?'+':'−'}{money(m.valor)}</strong>
              {m.tipo==='PAGAMENTO'&&!dialog.line.movimentos.some(a=>a.tipo==='ESTORNO'&&Number(a.referencia_pagamento_id)===Number(m.id))&&
                <button className="vd-outline" type="button" onClick={()=>{setReason('');setFormError('');setDialog({type:'ownerReverse',line:dialog.line,move:m})}}>Estornar</button>}
            </div>
          </div>):<p className="fc-hint">Nenhum pagamento registrado nesta comissão.</p>}
        </div>
        {Number(dialog.line.pendente)>0&&<form className="cm-form" onSubmit={recordOwnPayment}>
          <label>Forma de pagamento
            <FormControl type="select" value={methodId}
              onChange={setMethodId}
              options={paymentMethods.map(m=>({value:String(m.id),label:m.nome}))}
              placeholder="Selecione como pagou"/></label>
          <label>Valor realmente pago/recebido (R$)
            <input type="text" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 150,00"/></label>
          <label>Data de pagamento <FormControl type="date" value={date} onChange={setDate}/></label>
          <label>Descrição obrigatória
            <textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="Ex.: Comissão paga pelo clube / comissão retida no Pix"/></label>
          {formError&&<p className="cm-error" role="alert">{formError}</p>}
          <div className="cm-form-actions">
            <button type="button" className="cm-button" onClick={()=>setDialog(null)}>Cancelar</button>
            <button type="submit" disabled={busy} className="cm-button primary">{busy?'Salvando...':'Confirmar pagamento'}</button>
          </div>
        </form>}
      </div>}
      {dialog.type==='ownerReverse'&&<form className="cm-form" onSubmit={reverseOwnPayment}>
        <div className="com-inform">Estorno somente do registro financeiro de {money(dialog.move.valor)}. Não significa devolução física de dinheiro.</div>
        <label>Justificativa do estorno
          <textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions">
          <button type="button" className="cm-button" onClick={()=>setDialog({type:'ownerPayment',line:dialog.line})}>Voltar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Confirmar estorno</button>
        </div>
      </form>}
      {dialog.type==='policy'&&policy&&<div className="cm-form">
        <form className="cm-form" onSubmit={savePolicy}>
          <div className="com-inform">Percentuais sobre o valor de tabela do plano, exceto a divisão entre corretores, que utiliza o saldo da comissão após os participantes. Alterações não recalculam rateios já registrados.</div>
          {[
            ['percentual_atendente_dia_util','Atendente em dia útil (%)'],
            ['percentual_atendente_outros_dias','Atendente em outros dias (%)'],
            ['percentual_gerente','Gerente quando aplicável (%)'],
            ['divisao_segundo_corretor','Percentual do segundo corretor sobre o saldo (%)'],
          ].map(([key,label])=><label key={key}>{label}
            <input type="number" min="0" max="100" step="0.01"
              value={policy[key]??''} onChange={e=>setPolicy(p=>({...p,[key]:e.target.value}))}/></label>)}
          <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog(null)}>Fechar</button>
            <button type="submit" className="cm-button primary" disabled={busy}>Salvar percentuais</button></div>
        </form>
        <form className="cm-form" onSubmit={saveHoliday}>
          <strong>Feriados cadastrados</strong>
          <div className="com-inform">Segunda a sexta tem 10% no modelo inicial, exceto feriados. Cadastre os feriados aplicáveis antes de apurar, para não pagar o percentual errado.</div>
          <label>Data <FormControl type="date" value={holiday.data} onChange={v=>setHoliday(x=>({...x,data:v}))}/></label>
          <label>Descrição <input type="text" maxLength={120} value={holiday.descricao} onChange={e=>setHoliday(x=>({...x,descricao:e.target.value}))} placeholder="Ex.: Feriado municipal"/></label>
          <button type="submit" className="cm-button primary" disabled={busy}>Cadastrar feriado</button>
          <div className="fc-holiday-list">{holidays.slice(0,20).map(h=><div key={h.data}>
            <span>{dateBR(h.data)}</span><strong>{h.descricao}</strong></div>)}</div>
        </form>
        <form className="cm-form fc-exceptions-form" onSubmit={saveOverride}>
          <strong>Exceções por plano e forma de pagamento</strong>
          <div className="com-inform">Exemplo: se 5% do plano de um ano gera R$ 58,80, mas o atendente recebe R$ 60,00, cadastre uma regra de valor fixo de R$ 60,00 para esse plano em Outros dias. Para uma comissão maior em venda 100% à vista, selecione À vista. A regra vale para novas apurações, sem mexer nas já pagas.</div>
          <label>Versão do plano
            <FormControl type="select" value={override.plano_versao_id}
              onChange={v=>setOverride(x=>({...x,plano_versao_id:v}))}
              options={planCatalog.map(p=>({value:String(p.id),label:nameOfPlan(p.id)}))}
              placeholder="Selecione o plano"/></label>
          <div className="cm-form-grid">
            <label>Forma da venda
              <FormControl type="select" value={override.modalidade}
                onChange={v=>setOverride(x=>({...x,modalidade:v}))}
                options={[
                  {value:'TODOS',label:'Todas'},
                  {value:'AVISTA',label:'100% à vista'},
                  {value:'CARTAO',label:'Cartão'},
                  {value:'MISTO',label:'Misto'},
                ]}/></label>
            <label>Tipo de dia
              <FormControl type="select" value={override.tipo_dia}
                onChange={v=>setOverride(x=>({...x,tipo_dia:v}))}
                options={[
                  {value:'TODOS',label:'Todos os dias'},
                  {value:'UTIL',label:'Dia útil'},
                  {value:'OUTROS',label:'Feriado ou fim de semana'},
                ]}/></label>
          </div>
          <div className="cm-form-grid">
            <label>Participante
              <FormControl type="select" value={override.papel}
                onChange={v=>setOverride(x=>({...x,papel:v}))}
                options={[{value:'ATENDENTE',label:'Atendente / vendedor'},
                  {value:'GERENTE',label:'Gerente'}]}/></label>
            <label>Cálculo
              <FormControl type="select" value={override.tipo_calculo}
                onChange={v=>setOverride(x=>({...x,tipo_calculo:v}))}
                options={[{value:'FIXO',label:'Valor fixo (R$)'},
                  {value:'PERCENTUAL',label:'Percentual (%)'}]}/></label>
          </div>
          <label>{override.tipo_calculo==='FIXO'?'Valor combinado (R$)':'Percentual combinado (%)'}
            <input type="text" inputMode="decimal" value={override.valor}
              onChange={e=>setOverride(x=>({...x,valor:e.target.value}))}
              placeholder={override.tipo_calculo==='FIXO'?'Ex.: 60,00':'Ex.: 6,00'}/></label>
          <label>Observações
            <textarea maxLength={350} rows={2} value={override.observacoes}
              onChange={e=>setOverride(x=>({...x,observacoes:e.target.value}))}
              placeholder="Ex.: Arredondamento do atendente no plano de um ano"/></label>
          <div className="cm-form-actions">
            <button type="submit" className="cm-button primary" disabled={busy||!override.plano_versao_id}>
              Salvar exceção do plano</button>
          </div>
        </form>
        <div className="fc-exceptions-list">
          <strong>Exceções cadastradas</strong>
          {!planOverrides.length&&<p className="fc-hint">Ainda não há exceções. Serão usados os percentuais gerais.</p>}
          {planOverrides.map(e=><div key={e.id}>
            <span><strong>{nameOfPlan(e.plano_versao_id)}</strong>
              <small>{e.papel==='ATENDENTE'?'Atendente':'Gerente'} · {e.modalidade==='AVISTA'?'100% à vista':e.modalidade} · {e.tipo_dia==='UTIL'?'Dia útil':e.tipo_dia==='OUTROS'?'Feriado/fim de semana':'Todos os dias'} · {e.tipo_calculo==='FIXO'?money(e.valor):e.valor+'%'}</small></span>
            <button className="vd-outline" type="button" disabled={busy}
              onClick={()=>removeOverride(e.id)}>
              {removingOverride===e.id?'Confirmar exclusão':'Excluir'}</button>
          </div>)}
        </div>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
      </div>}
      {dialog.type==='rateios'&&<form className="cm-form fc-rateio-form" onSubmit={saveRateios}>
        <div className="com-inform">Comissão disponível: {money(dialog.op.comissao_base)}. A comissão pertence primeiro a {dialog.op.corretor_nome}. Cada pessoa só pode repartir o que recebeu. Não haverá pagamento automático.</div>
        <div className="fc-suggest">
          <span>Referência para atendimento: {suggestion}% de {money(dialog.op.valor_tabela)} = <strong>{suggestedValue}</strong></span>
          <button type="button" className="vd-outline" onClick={()=>setSuggestion(suggestion===5?10:5)}>Usar {suggestion===5?'10%':'5%'}</button>
          <small>Segunda a sexta normalmente 10%, exceto feriados; outros dias 5%. Confira o caso antes de informar os valores. O clube pode arredondar.</small>
        </div>
        {items.map((r,i)=><div className="fc-rateio-item" key={i}>
          <div className="fc-rateio-heading"><strong>Participação {i+1}</strong>
            <button type="button" className="vd-outline" onClick={()=>setItems(list=>list.filter((_,index)=>index!==i))}>Retirar</button></div>
          <div className="cm-form-grid">
            <label>Quem paga <FormControl type="select" value={r.responsavel_pessoa_id}
              onChange={v=>changeItem(i,'responsavel_pessoa_id',v)} options={peopleOptions}/></label>
            <label>Quem recebe <FormControl type="select" value={r.beneficiario_pessoa_id}
              onChange={v=>changeItem(i,'beneficiario_pessoa_id',v)} options={peopleOptions}
              placeholder="Selecione a pessoa"/></label>
          </div>
          <div className="cm-form-grid">
            <label>Função <FormControl type="select" value={r.papel}
              onChange={v=>changeItem(i,'papel',v)} options={roles}/></label>
            <label>Valor (R$) <input type="text" inputMode="decimal" value={r.valor}
              placeholder="Ex.: 60,00" onChange={e=>changeItem(i,'valor',e.target.value)}/></label>
          </div>
          <label>Observações <input maxLength={500} value={r.observacoes||''}
            onChange={e=>changeItem(i,'observacoes',e.target.value)}
            placeholder="Ex.: Divisão de corretor, feriado ou arredondamento"/></label>
        </div>)}
        <button className="vd-outline" type="button" onClick={()=>setItems(old=>[...old,newRow(dialog.op.corretor_pessoa_id)])}
          disabled={items.length>=30}>＋ Adicionar participante</button>
        <div className="vd-summary-line"><span>Distribuição lançada: {money(allocationTotal)}</span>
          <strong>Base: {money(dialog.op.comissao_base)}</strong></div>
        <label><span className="field-caption">Justificativa da apuração <em>*</em></span>
          <textarea rows={2} maxLength={500} value={reason}
            onChange={e=>setReason(e.target.value)}
            placeholder="Ex.: Fechamento da venda, divisão confirmada com os envolvidos"/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button className="cm-button" type="button" onClick={()=>setDialog(null)}>Cancelar</button>
          <button className="cm-button primary" disabled={busy} type="submit">{busy?'Salvando...':'Salvar rateio'}</button></div>
      </form>}
      {dialog.type==='ledger'&&detail&&<div className="cm-form">
        <div className="fc-stats fc-ledger-summary">
          <div><span>Total devido</span><strong>{money(detail.rateio.valor)}</strong></div>
          <div><span>Pago até agora</span><strong>{money(detail.pago)}</strong></div>
          <div><span>Ainda a pagar</span><strong>{money(Number(detail.rateio.valor)-Number(detail.pago))}</strong></div>
        </div>
        <div className="fc-ledger-moves">{detail.movimentos.length?detail.movimentos.map(m=><div key={m.id}>
          <div><strong>{m.tipo==='PAGAMENTO'?'Pagamento confirmado':'Estorno de lançamento'}</strong>
            <small>{dateBR(m.data_pagamento)} · {m.forma_nome||'Forma não informada'} · #{m.id}</small>
            {m.observacoes&&<small>{m.observacoes}</small>}</div>
          <div><strong>{m.tipo==='PAGAMENTO'?'+':'−'}{money(m.valor)}</strong>
            {m.tipo==='PAGAMENTO'&&!detail.movimentos.some(x=>Number(x.referencia_pagamento_id)===Number(m.id))&&
              <button type="button" className="vd-outline" onClick={()=>{setReason('');setFormError('');setDialog({type:'reverse',rateio:dialog.rateio,move:m})}}>Estornar</button>}
          </div>
        </div>):<p className="fc-hint">Nenhum repasse registrado.</p>}</div>
        {formError&&<p className="cm-error">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog(null)}>Fechar</button>
          <button type="button" className="cm-button primary"
            disabled={Number(detail.rateio.valor)<=Number(detail.pago)}
            onClick={()=>{setAmount((Number(detail.rateio.valor)-Number(detail.pago)).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));setReason('');setFormError('');setDialog({type:'pay',rateio:dialog.rateio})}}>
            Registrar pagamento</button></div>
      </div>}
      {dialog.type==='pay'&&<form className="cm-form" onSubmit={pay}>
        <div className="com-inform">Confirme somente dinheiro que já foi efetivamente pago ao beneficiário. Este botão não realiza transferência bancária.</div>
          <label>Forma de pagamento
            <FormControl type="select" value={methodId}
              onChange={setMethodId}
              options={paymentMethods.map(m=>({value:String(m.id),label:m.nome}))}
              placeholder="Selecione como pagou"/></label>

        <label>Valor pago (R$) <input type="text" inputMode="decimal" required
          value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label>
        <label>Data do pagamento <FormControl type="date" value={date} onChange={setDate}/></label>
        <label>Observações <textarea maxLength={500} rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button className="cm-button" type="button" onClick={()=>setDialog({type:'ledger',rateio:dialog.rateio})}>Voltar</button>
          <button className="cm-button primary" type="submit" disabled={busy}>{busy?'Salvando...':'Confirmar pagamento'}</button></div>
      </form>}
      {dialog.type==='reverse'&&<form className="cm-form" onSubmit={reverse}>
        <div className="com-inform">O estorno desfaz somente o registro contábil de {money(dialog.move.valor)}. Se houve dinheiro efetivo devolvido, ajuste também fora desta operação.</div>
        <label><span className="field-caption">Motivo do estorno <em>*</em></span>
          <textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button className="cm-button" type="button" onClick={()=>setDialog({type:'ledger',rateio:dialog.rateio})}>Cancelar</button>
          <button className="cm-button primary" type="submit" disabled={busy}>{busy?'Salvando...':'Confirmar estorno'}</button></div>
      </form>}
    </SurfaceModal>}
  </div>
}
