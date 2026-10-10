import {useEffect,useMemo,useState} from 'react'
import {comercialGet, dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './ComercialPages.css'
import './Fechamentos.css'
import './Financeiro.css'

const brl=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0))
const initialPeriod=()=>{
  const today=new Date()
  const first=new Date(today.getFullYear(),today.getMonth(),1)
  const last=new Date(today.getFullYear(),today.getMonth()+1,0)
  const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
  return [fmt(first),fmt(last)]
}

/**
 * FINANCEIRO = contas de pessoas e pagamentos; FECHAMENTOS = apuração por venda.
 * Não mistura comissão ainda estimada com pagamentos efetivamente registrados.
 */
export default function Financeiro({role='admin'}){
  const admin=role==='admin'
  const [defaultStart,defaultEnd]=useMemo(initialPeriod,[])
  const [start,setStart]=useState(defaultStart)
  const [end,setEnd]=useState(defaultEnd)
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(start>end){setError('A data inicial não pode ultrapassar a final.');return}
    let live=true
    setLoading(true)
    comercialGet('/api/fechamentos/'+(admin?'resumo':'meu')+'?'+new URLSearchParams({inicio:start,fim:end}))
      .then(payload=>{if(live){setData(payload);setError('')}})
      .catch(e=>{if(live)setError(e.message)})
      .finally(()=>{if(live)setLoading(false)})
    return ()=>{live=false}
  },[admin,start,end])
  const people=data?.saldos||[]
  const operations=data?.operacoes||[]
  const pending=operations.flatMap(op=>op.rateios.map(a=>({...a,operation:op})))
    .filter(a=>Number(a.pendente)>0)
  const paidTotal=operations.flatMap(op=>op.rateios).reduce((total,r)=>total+Number(r.pago),0)
  const dueTotal=pending.reduce((total,r)=>total+Number(r.pendente),0)
  return <div className="com-page fin-page">
    <header className="com-heading"><div><span className="com-eyebrow">SPLASH / GESTÃO</span>
      <h1>{admin?'Financeiro':'Meu financeiro'}</h1>
      <p>{admin?'Contas separadas por pessoa, participações pendentes e repasses confirmados.':'Suas comissões e valores a receber, sem acesso às contas de terceiros.'}</p>
    </div></header>
    <section className="com-panel fin-filters">
      <div className="fc-period">
        <label>Data inicial <FormControl type="date" value={start} onChange={setStart}/></label>
        <label>Data final <FormControl type="date" value={end} onChange={setEnd}/></label>
      </div>
      <small>Período pela data da venda. Pagamentos posteriores ligados a essas vendas também aparecem no extrato.</small>
    </section>
    {error&&<div role="alert" className="com-alert error">{error}</div>}
    {loading?<section className="com-panel"><div className="com-empty">Carregando contas...</div></section>:null}
    {!loading&&!admin&&data&&<section className="com-panel">
      <div className="com-panel-head"><div><h2>Conta de {data.pessoa?.nome}</h2>
        <p>Somente lançamentos vinculados à sua pessoa</p></div></div>
      <div className="fin-kpis">
        <div><span>Minha participação prevista</span><strong>{brl(data.resumo?.participacao_liquida_prevista)}</strong></div>
        <div><span>Repasses recebidos de outras pessoas</span><strong>{brl(data.resumo?.rateios_ja_pagos_a_mim)}</strong></div>
        <div><span>Repasses ainda devidos a mim</span><strong>{brl(data.resumo?.rateios_pendentes_para_mim)}</strong></div>
        <div><span>Participações que devo repassar</span><strong>{brl(data.resumo?.obrigacoes_de_rateio)}</strong></div>
      </div>
      <p className="fin-note">Participação prevista não significa dinheiro recebido. Despesas, empréstimos e valores mantidos para o clube serão conciliados na etapa de conta-corrente completa.</p>
    </section>}
    {!loading&&admin&&data&&<>
      <section className="fin-kpis">
        <div><span>Participações a repassar</span><strong>{brl(dueTotal)}</strong></div>
        <div><span>Repasses já confirmados</span><strong>{brl(paidTotal)}</strong></div>
        <div><span>Contas com apuração</span><strong>{people.length}</strong></div>
      </section>
      <section className="com-panel">
        <div className="com-panel-head"><div><h2>Contas por pessoa</h2>
          <p>Valores da Marta, James e demais pessoas continuam separados, mesmo quando você paga por elas.</p></div></div>
        {people.length===0?<div className="com-empty">Sem comissões calculadas no período.</div>:
          <div className="fin-accounts">{people.map(p=><article key={p.id}>
            <div><strong>{p.nome}</strong><small>Comissão nas próprias vendas: {brl(p.comissoes)}</small></div>
            <div className="fin-account-amounts">
              <span>Participação prevista <strong>{brl(p.saldo_proprio)}</strong></span>
              <span>Repasses de terceiros pendentes <strong>{brl(p.repasses_pendentes)}</strong></span>
              <span>Repasses confirmados <strong>{brl(p.repasses_pagos)}</strong></span>
            </div>
          </article>)}</div>}
      </section>
      <section className="com-panel">
        <div className="com-panel-head"><div><h2>Pagamentos ainda pendentes</h2>
          <p>Use Fechamentos para apurar ou registrar o pagamento efetivo.</p></div></div>
        {!pending.length?<div className="com-empty">Nenhum repasse pendente entre os participantes.</div>:
          <div className="fin-pending">{pending.map(r=><article key={r.id}>
            <div><strong>{r.beneficiario_nome}</strong>
              <small>De: {r.origem_nome} · {r.papel} · Venda {r.operation.numero_titulo||'#'+r.operation.id} {r.operation.sigla_plano||''} · {dateBR(r.operation.data_venda)}</small></div>
            <strong>{brl(r.pendente)}</strong>
          </article>)}</div>}
      </section>
      <p className="com-disclaimer">Este Financeiro é uma consulta das participações e dos repasses registrados. Ainda não representa um saldo de caixa completo nem a liquidação do domingo: empréstimos, gastos e dinheiro do clube serão conciliados separadamente.</p>
    </>}
  </div>
}
