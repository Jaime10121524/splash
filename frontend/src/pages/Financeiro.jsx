import {useEffect,useMemo,useState} from 'react'
import {comercialGet,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './ComercialPages.css'
import './Fechamentos.css'
import './Financeiro.css'

const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0))
const period=()=>{
  const now=new Date()
  const first=new Date(now.getFullYear(),now.getMonth(),1)
  const last=new Date(now.getFullYear(),now.getMonth()+1,0)
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
  return [iso(first),iso(last)]
}

/** Consulta individual protegida na API, sem cadastro de pagamento no perfil comum. */
export default function Financeiro({role='admin'}){
  const admin=role==='admin'
  const [initialStart,initialEnd]=useMemo(period,[])
  const [start,setStart]=useState(initialStart)
  const [end,setEnd]=useState(initialEnd)
  const [payload,setPayload]=useState(null)
  const [selected,setSelected]=useState('')
  const [expanded,setExpanded]=useState({})
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    let active=true
    if(!start||!end||start>end){setError('Escolha um período válido.');setBusy(false);return}
    setBusy(true)
    comercialGet('/api/fechamentos/contas?'+new URLSearchParams({inicio:start,fim:end}))
      .then(data=>{
        if(!active)return
        setPayload(data);setError('')
        setSelected(current=>current && !(data.contas||[]).some(a=>String(a.pessoa_id)===current)?'':current)
      })
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setBusy(false)})
    return ()=>{active=false}
  },[admin,start,end])

  const accounts=payload?.contas||[]
  const filtered=selected?accounts.filter(a=>String(a.pessoa_id)===selected):accounts
  const totals=filtered.reduce((r,a)=>({
    total:r.total+Number(a.resumo.total),
    paid:r.paid+Number(a.resumo.pago),
    pending:r.pending+Number(a.resumo.pendente),
  }),{total:0,paid:0,pending:0})
  const setOpen=id=>setExpanded(p=>({...p,[id]:!p[id]}))
  return <div className="com-page fin-page">
    <header className="com-heading"><div><span className="com-eyebrow">SPLASH / FINANCEIRO</span>
      <h1>{admin?'Contas e comissões':'Minhas comissões'}</h1>
      <p>{admin?'Quanto cada pessoa ganhou, recebeu e ainda tem para receber.':
        'Confira cada atendimento ou venda e veja os pagamentos registrados para você.'}</p>
    </div></header>
    <section className="com-panel fin-filters">
      <div className="fc-period">
        <label>De <FormControl type="date" value={start} onChange={setStart}/></label>
        <label>Até <FormControl type="date" value={end} onChange={setEnd}/></label>
      </div>
      {admin&&<div className="fc-selection"><label>Conta de
        <FormControl type="select" value={selected} onChange={setSelected}
          options={[{value:'',label:'Todas as pessoas'},...accounts.map(a=>({
            value:String(a.pessoa_id),label:a.nome,
          }))]}/></label></div>}
      <small>O período considera a data da venda. Pagamentos dessas vendas podem ter ocorrido posteriormente.</small>
    </section>
    {error&&<div className="com-alert error" role="alert">{error}</div>}
    {busy&&<section className="com-panel"><div className="com-empty">Carregando seu extrato...</div></section>}
    {!busy&&payload&&<>
      <section className="fin-kpis">
        <div><span>Total de comissões a receber</span><strong>{money(totals.total)}</strong></div>
        <div><span>Já recebido e confirmado</span><strong>{money(totals.paid)}</strong></div>
        <div><span>Ainda falta receber</span><strong>{money(totals.pending)}</strong></div>
      </section>
      {payload.possivel_truncamento&&<p className="com-alert">O período retornou o limite de 500 vendas. Reduza as datas para ver todos os lançamentos.</p>}
      {!filtered.length?<section className="com-panel"><div className="com-empty">Nenhuma comissão apurada para o período.</div></section>:
      <section className="fin-accounts-new">
        {filtered.map(a=><article className="fin-person-card" key={a.pessoa_id}>
          <div className="fin-person-title">
            <div><h2>{admin?a.nome:'Meu extrato'}</h2><small>{a.itens.length} participações por venda / atendimento</small></div>
            <div className="fin-person-title-total"><span>Falta receber</span><strong>{money(a.resumo.pendente)}</strong></div>
          </div>
          <div className="fin-account-stats">
            <div><span>Comissões</span><strong>{money(a.resumo.total)}</strong></div>
            <div><span>Recebido</span><strong>{money(a.resumo.pago)}</strong></div>
            <div><span>Pendente</span><strong>{money(a.resumo.pendente)}</strong></div>
          </div>
          {admin&&Number(a.resumo.a_repassar)>0&&
            <p className="fin-outgoing">Além das próprias comissões, esta pessoa tem {money(a.resumo.repasses_pendentes)} para repassar a outros participantes ({money(a.resumo.a_repassar)} no total).</p>}
          <div className="fin-lines">
            {a.itens.map((item,i)=>{
              const code=(item.titulo||'').trim()
              const id=item.tipo+'-'+item.operacao_id+'-'+(item.rateio_id||'0')+'-'+i
              const open=!!expanded[a.pessoa_id+'-'+id]
              return <div className="fin-line" key={id}>
                <div className="fin-line-top">
                  <div className="fin-line-about">
                    <strong>{item.descricao}</strong>
                    <small>Venda {code||'#'+item.operacao_id} · {dateBR(item.data_venda)}
                      {item.visita_id?' · Atendimento #'+item.visita_id:''}</small>
                    {admin&&item.cliente_nome&&<small>Cliente: {item.cliente_nome}</small>}
                    {admin&&<small>Responsável pelo acerto: {item.pagador}</small>}
                  </div>
                  <button type="button" className="fin-line-toggle" aria-expanded={open}
                    onClick={()=>setOpen(a.pessoa_id+'-'+id)}>
                    <span>{money(item.pendente)} pendente</span>
                    <span>{open?'Ocultar detalhes':'Ver detalhes'}</span>
                  </button>
                </div>
                <div className="fin-line-numbers">
                  <span>Total <b>{money(item.total)}</b></span>
                  <span>Recebido <b>{money(item.pago)}</b></span>
                  <span>Falta <b>{money(item.pendente)}</b></span>
                </div>
                {open&&<div className="fin-line-history">
                  <strong>Histórico de pagamentos desta participação</strong>
                  {item.movimentos.length?item.movimentos.map(m=><div key={m.id}>
                    <span>{m.tipo==='ESTORNO'?'Estorno do registro':'Pagamento confirmado'} · {dateBR(m.data)}
                      {m.observacoes?' · '+m.observacoes:''}</span>
                    <b>{m.tipo==='ESTORNO'?'-':'+'}{money(m.valor)}</b>
                  </div>):<p>Nenhum pagamento confirmado até agora.</p>}
                </div>}
              </div>
            })}
          </div>
        </article>)}
      </section>}
      <p className="com-disclaimer">{payload.aviso} Os valores “recebidos” são pagamentos efetivamente registrados pelo administrador, não transferências realizadas por esta tela.</p>
    </>}
  </div>
}
