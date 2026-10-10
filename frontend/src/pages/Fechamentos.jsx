import {useEffect,useMemo,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
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

  async function reload(){
    if(!start||!end||start>end)throw new Error('Selecione início e fim válidos.')
    const endpoint=admin?'resumo':'meu'
    const query='?'+new URLSearchParams({inicio:start,fim:end})
    if(admin){
      const [data,accountData]=await Promise.all([
        comercialGet('/api/fechamentos/'+endpoint+query),
        comercialGet('/api/fechamentos/contas'+query),
      ])
      setReport(data);setAccounts(accountData.contas||[])
    } else {
      const [data,accountData]=await Promise.all([
        comercialGet('/api/fechamentos/'+endpoint+query),
        comercialGet('/api/fechamentos/contas'+query),
      ])
      setReport(data);setAccounts(accountData.contas||[])
    }
  }
  useEffect(()=>{
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
        valor:value,data_pagamento:date,observacoes:reason.trim(),
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
        valor:value,data_pagamento:date,observacoes:reason,
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
      setHolidays(refreshed.feriados||[]);setHoliday({data:localDateISO(),descricao:''})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  const title=admin?'Apuração e repasses':'Meu financeiro'
  return <div className="com-page fc-page">
    <header className="com-heading">
      <div><span className="com-eyebrow">SPLASH / FINANCEIRO</span><h1>{title}</h1>
        <p>{admin?'Distribuição da comissão de cada venda, pagamentos e saldos por pessoa.':'Suas comissões apuradas, sem acesso ao financeiro dos demais.'}</p></div>
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
              <button type="button" className="vd-outline" aria-expanded={open}
                onClick={()=>setOpenPersons(p=>({...p,[person.pessoa_id]:!p[person.pessoa_id]}))}>
                {open?'Ocultar vendas':'Ver vendas'}
              </button>
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
      title={dialog.type==='policy'?'Regras automáticas e feriados':
        dialog.type==='ownerPayment'?'Pagamentos da comissão do corretor':
        dialog.type==='ownerReverse'?'Estornar pagamento do corretor':
        dialog.type==='rateios'?'Distribuir comissão':dialog.type==='pay'?'Registrar repasse':
        dialog.type==='reverse'?'Estornar repasse':'Extrato do participante'}
      subtitle={dialog.type==='rateios'?dialog.op.cliente_nome:dialog.rateio?.beneficiario_nome}
      busy={busy} onClose={()=>setDialog(null)}>
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
              <small>{dateBR(m.data)} · {m.observacoes||'Sem observação'}</small></div>
            <div><strong>{m.tipo==='PAGAMENTO'?'+':'−'}{money(m.valor)}</strong>
              {m.tipo==='PAGAMENTO'&&!dialog.line.movimentos.some(a=>a.tipo==='ESTORNO'&&Number(a.referencia_pagamento_id)===Number(m.id))&&
                <button className="vd-outline" type="button" onClick={()=>{setReason('');setFormError('');setDialog({type:'ownerReverse',line:dialog.line,move:m})}}>Estornar</button>}
            </div>
          </div>):<p className="fc-hint">Nenhum pagamento registrado nesta comissão.</p>}
        </div>
        {Number(dialog.line.pendente)>0&&<form className="cm-form" onSubmit={recordOwnPayment}>
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
            <small>{dateBR(m.data_pagamento)} · #{m.id}</small>
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
