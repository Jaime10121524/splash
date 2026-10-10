import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import FechamentosLegado from './Fechamentos.jsx'
import './FechamentosPeriodos.css'

const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const cents=n=>Math.round(Number(n||0)*100)
/**
 * Os relatórios concluídos mais antigos possuem um snapshot sem as participações
 * recebidas por corretores do grupo. Recalcula somente a exibição, sem mexer
 * no histórico de vendas ou nos pagamentos.
 */
const summaryByPerson=current=>{
  const benefits=new Map((current?.participantes||[]).map(p=>[String(p.pessoa_id),p]))
  return (current?.corretores||[]).map(p=>{
    const part=benefits.get(String(p.pessoa_id))
    const received=cents(part?.total)
    const result=cents(p.comissao)+received-cents(p.repasse_total)-cents(p.despesas)
    return {...p,participacoes_total:received/100,
      participacoes_recebidas:cents(part?.pago)/100,
      participacoes_pendentes:cents(part?.pendente)/100,
      resultado_estimado:result/100}
  })
}
const groupedPayments=current=>{
  const groups=new Map()
  const append=(id,name,entry)=>{
    const key=String(id)
    if(!groups.has(key))groups.set(key,{id:key,nome:name||'Participante',entries:[],totalCent:0})
    const person=groups.get(key)
    person.entries.push(entry)
    if(entry.situacao==='ATIVO')person.totalCent+=cents(entry.valor)
  }
  for(const m of current?.historico_titulares||[])append(m.corretor_pessoa_id,m.beneficiario_nome,{...m,kind:'titular',key:'T'+m.id})
  for(const m of current?.historico_repasses||[])append(m.beneficiario_pessoa_id,m.beneficiario_nome,{...m,kind:'repasse',key:'R'+m.id})
  return [...groups.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
}
const suggestedAmount=n=>Number(n)>0?Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''
const cleanMoney=v=>{
  const s=String(v||'').trim()
  const x=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(x) && Number(x)>0?x:null
}
const monthRange=()=>{
  const n=new Date(),iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
  return [iso(new Date(n.getFullYear(),n.getMonth(),1)),iso(new Date(n.getFullYear(),n.getMonth()+1,0))]
}
const emptyEntry=()=>({pessoa_id:'',forma_id:'',valor:'',data:localDateISO(),obs:''})
const requestKey=()=>typeof crypto!=='undefined'&&crypto.randomUUID
  ?crypto.randomUUID():String(Date.now())+'_'+Math.random().toString(36).slice(2,15)

export default function FechamentosPeriodos({role='admin'}){
  const admin=role==='admin'
  const [rangeStart,rangeEnd]=monthRange()
  const [start,setStart]=useState(rangeStart)
  const [end,setEnd]=useState(rangeEnd)
  const [scope,setScope]=useState(null)
  const [owner,setOwner]=useState('')
  const [history,setHistory]=useState([])
  const [current,setCurrent]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [modal,setModal]=useState(null)
  const [nonce,setNonce]=useState(requestKey())
  const [record,setRecord]=useState(emptyEntry)
  const [payMethods,setPayMethods]=useState([{forma_id:'',valor:''}])
  const [payee,setPayee]=useState(null)
  const [link,setLink]=useState({child:'',boss:''})
  const [legacy,setLegacy]=useState(false)
  const [salesReviewed,setSalesReviewed]=useState(false)

  const accounts=scope?.responsaveis||[]
  const selectable=accounts.filter(p=>p.pode_fechar)
  const methods=scope?.formas||[]
  const groupedHistory=history.filter(item=>!admin||!owner||String(item.responsavel_pessoa_id)===owner)
  const personName=id=>accounts.find(a=>String(a.id)===String(id))?.nome
    ||current?.corretores?.find(a=>String(a.pessoa_id)===String(id))?.nome||'Corretor #'+id
  const resetError=()=>{setError('');setNotice('')}
  async function fetchLists(){
    const [groups,hist]=await Promise.all([
      comercialGet('/api/fechamentos-periodos/escopos'),
      comercialGet('/api/fechamentos-periodos'),
    ])
    setScope(groups);setHistory(hist.fechamentos||[])
    setOwner(prev=>prev||(groups.responsaveis||[]).find(p=>p.pode_fechar&&(!admin||String(p.id)===String(groups.pessoa_logada)))?.id?.toString()
      ||(groups.responsaveis||[]).find(p=>p.pode_fechar)?.id?.toString()||'')
  }
  async function fetchDetail(id){
    const response=await comercialGet('/api/fechamentos-periodos/'+id)
    setCurrent(response.fechamento)
  }
  useEffect(()=>{
    let active=true
    setLoading(true)
    Promise.all([
      comercialGet('/api/fechamentos-periodos/escopos'),
      comercialGet('/api/fechamentos-periodos'),
    ]).then(([groups,hist])=>{
      if(!active)return
      setScope(groups);setHistory(hist.fechamentos||[])
      setOwner((groups.responsaveis||[]).find(p=>p.pode_fechar&&(!admin||String(p.id)===String(groups.pessoa_logada)))?.id?.toString()
        ||(groups.responsaveis||[]).find(p=>p.pode_fechar)?.id?.toString()||'')
    }).catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[admin])

  async function action(url,payload,after='refresh'){
    setBusy(true);resetError()
    try{
      const result=await comercialPost(url,payload)
      setNotice(result.message)
      if(after==='new'){
        setSalesReviewed(false)
        await fetchLists();await fetchDetail(result.id)
      }else if(after==='groups'){
        await fetchLists()
      }else if(current){
        if(url.endsWith('/voltar'))setSalesReviewed(true)
        await fetchDetail(current.id);await fetchLists()
      }
      setModal(null)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  function create(e){
    e.preventDefault()
    if(!owner||!start||!end||start>end)return setError('Selecione responsável e período.')
    action('/api/fechamentos-periodos',{
      responsavel_pessoa_id:Number(owner),inicio:start,fim:end,
    },'new')
  }
  async function view(id){
    setSalesReviewed(false)
    setLoading(true);resetError()
    try{await fetchDetail(id)}catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  function openEntry(){
    setNonce(requestKey())
    const first=current?.corretores?.[0]
    setRecord({pessoa_id:String(first?.pessoa_id||''),
      forma_id:String(methods[0]?.id||''),valor:suggestedAmount(first?.a_receber_estimado),data:localDateISO(),obs:''})
    setModal('entrada')
  }
  function openAbate(){
    setNonce(requestKey())
    setRecord({emprestimo_id:'',valor:'',data:localDateISO()})
    setModal('abate')
  }
  function openPay(person,type='participacao'){
    setNonce(requestKey())
    setPayee({...person,type})
    setRecord({data:localDateISO()})
    setPayMethods([{forma_id:String(methods[0]?.id||''),valor:suggestedAmount(person.pendente)}])
    setModal('pagamento')
  }
  function saveEntry(e){
    e.preventDefault()
    const amount=cleanMoney(record.valor)
    if(!amount)return setError('Informe um valor de recebimento válido.')
    action('/api/fechamentos-periodos/'+current.id+'/receber',{
      corretor_pessoa_id:Number(record.pessoa_id),forma_id:Number(record.forma_id),
      valor:amount,data_recebimento:record.data,observacoes:record.obs||'',chave_requisicao:nonce,
    })
  }
  function saveAbate(e){
    e.preventDefault()
    const amount=cleanMoney(record.valor)
    if(!amount)return setError('Informe um valor de abatimento válido.')
    action('/api/fechamentos-periodos/'+current.id+'/abater',{
      emprestimo_id:Number(record.emprestimo_id),valor:amount,data_abate:record.data,chave_requisicao:nonce,
    })
  }
  function savePay(e){
    e.preventDefault()
    const forms=payMethods.map(x=>({forma_id:Number(x.forma_id),valor:cleanMoney(x.valor)}))
    if(forms.some(x=>!x.forma_id||!x.valor))return setError('Informe forma e valor positivo em cada linha.')
    const sum=forms.reduce((n,x)=>n+Number(x.valor),0)
    if(sum>Number(payee.pendente)+.00001)return setError('Total maior que o saldo pendente.')
    action('/api/fechamentos-periodos/'+current.id+
      (payee.type==='titular'?'/titular/pagar':'/pagar'),{
      ...(payee.type==='titular'?{corretor_pessoa_id:Number(payee.pessoa_id)}:
        {beneficiario_pessoa_id:Number(payee.pessoa_id)}),
      data_pagamento:record.data,formas:forms,chave_requisicao:nonce,
    })
  }
  function saveReversal(e){
    e.preventDefault()
    if(!record.justificativa||record.justificativa.trim().length<5){
      return setError('Informe o motivo do estorno em pelo menos cinco caracteres.')
    }
    action('/api/fechamentos-periodos/'+current.id+
      (record.isTitular?'/titulares/':'/repasses/')+record.id+'/estornar',{
      justificativa:record.justificativa.trim(),
    })
  }
  function saveLink(e){
    e.preventDefault()
    if(!link.child)return setError('Selecione o corretor.')
    action('/api/fechamentos-periodos/vincular',{
      corretor_pessoa_id:Number(link.child),
      responsavel_pessoa_id:link.boss?Number(link.boss):null,
    },'groups')
  }
  function printReport(){window.print()}
  const closeModal=()=>!busy&&setModal(null)
  const amountPaid=current?.resumo?.recebido_clube||'0.00'
  const paidOut=current?.resumo?.pagamentos_periodo||'0.00'
  const currentStage=!current?0:current.status==='CONCLUIDO'?4:current.status==='REPASSES'?3:salesReviewed?2:1
  const stepLabels=['','1. Vendas do grupo','2. Receber do clube','3. Pagar participantes','4. Relatório concluído']
  const peopleReport=summaryByPerson(current)
  const paymentsByPerson=groupedPayments(current)
  const groupResult=peopleReport.reduce((total,p)=>total+cents(p.resultado_estimado),0)/100
  return <div className="com-page fpw-page">
    <header className="com-heading fpw-heading">
      <div><span className="com-eyebrow">SPLASH / FECHAMENTOS</span>
        <h1>Fechamento de período</h1>
        <p>Concilie o dinheiro recebido pelo responsável do grupo, sem transferir a titularidade das comissões. Depois registre os pagamentos efetivamente realizados.</p>
      </div>
      <div className="fpw-head-actions">
        {admin&&<button className="vd-outline" type="button" onClick={()=>setLegacy(v=>!v)}>
          {legacy?'Voltar ao fechamento':'Regras e ajustes anteriores'}</button>}
        {admin&&<button className="vd-outline" type="button" onClick={()=>setModal('vinculos')}>Responsabilidades</button>}
        {current&&<button className="vd-outline" type="button" onClick={()=>{setCurrent(null);setLegacy(false);setSalesReviewed(false)}}>Voltar ao histórico</button>}
      </div>
    </header>
    {legacy&&admin?<FechamentosLegado role={role}/>:<>
      {notice&&<div className="com-alert success" role="status">{notice}
        <button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
      {error&&<div className="com-alert error" role="alert">{error}
        <button type="button" onClick={()=>setError('')}>Fechar</button></div>}
      {loading?<section className="com-panel"><div className="com-empty">Carregando fechamentos...</div></section>:
      !current?<>
        <section className="com-panel fpw-create">
          <div className="com-panel-head"><div><h2>Novo fechamento</h2>
            <p>Etapa 1 — escolha o responsável e as datas. Apenas os corretores vinculados a ele serão considerados.</p></div></div>
          <form className="fpw-form" onSubmit={create}>
            {admin&&<label>Responsável pelo fechamento *
              <FormControl type="select" value={owner} onChange={setOwner}
                options={selectable.map(x=>({value:String(x.id),label:x.nome}))}
                placeholder="Selecione o corretor responsável"/></label>}
            {!admin&&<strong>{accounts.find(x=>x.pode_fechar)?.nome||
              'Você ainda não pode abrir um fechamento separado. Consulte seu responsável.'}</strong>}
            <div className="fpw-two">
              <label>Data inicial * <FormControl type="date" value={start} onChange={setStart}/></label>
              <label>Data final * <FormControl type="date" value={end} onChange={setEnd}/></label>
            </div>
            {owner&&<p className="fpw-help">Incluídos neste grupo: {accounts.filter(x=>
              x.id===Number(owner)||x.responsavel_id===Number(owner)).map(x=>x.nome).join(', ')||personName(owner)}.
              Corretores independentes não entram nesta seleção.</p>}
            <div className="fpw-actions">
              <button type="submit" className="cm-button primary" disabled={busy||!owner}>
                {busy?'Abrindo...':'Iniciar fechamento'}</button>
            </div>
          </form>
        </section>
        <section className="com-panel">
          <div className="com-panel-head"><div><h2>Fechamentos anteriores</h2>
            <p>Períodos separados por responsável. Reabra para visualizar e salvar o relatório como PDF.</p></div>
            <span className="com-count">{groupedHistory.length} registros</span></div>
          <div className="fpw-history">{groupedHistory.length===0?<div className="com-empty">Nenhum fechamento encontrado.</div>:
            groupedHistory.map(x=><button className="fpw-history-row" type="button" key={x.id}
              onClick={()=>view(x.id)}>
              <span><strong>#{x.id} · {x.responsavel_nome}</strong>
                <small>{dateBR(x.inicio)} a {dateBR(x.fim)}</small></span>
              <span className={x.status==='CONCLUIDO'?'fpw-state done':'fpw-state'}>{x.status==='CONCLUIDO'?'Concluído':'Em andamento'}</span>
            </button>)}</div>
        </section>
      </>:<>
        <div className="fpw-period-head">
          <div><h2>Fechamento #{current.id} — {current.responsavel_nome}</h2>
            <small>{dateBR(current.inicio)} a {dateBR(current.fim)} · {current.quantidade_vendas} venda(s)</small></div>
          <span className={current.status==='CONCLUIDO'?'fpw-state done':'fpw-state'}>{stepLabels[currentStage]}</span>
        </div>
        <div className="fpw-steps" aria-label="Progresso do fechamento">
          {[1,2,3,4].map(step=><span key={step}
            className={currentStage===step?'active':currentStage>step?'complete':''}
            aria-current={currentStage===step?'step':undefined}>{stepLabels[step]}</span>)}
        </div>
        {currentStage===1&&<section className="com-panel">
          <div className="com-panel-head"><div><h2>1. Vendas e comissões por corretor</h2>
            <p>Somente as vendas pertencentes a este grupo. As contas pessoais continuam separadas.</p></div></div>
          <div className="fpw-people">
            {current.corretores.map(p=><details key={p.pessoa_id} className="fpw-person">
              <summary><span><strong>{p.nome}</strong><small>{p.vendas.length} venda(s) · Antes dos rateios e despesas</small></span>
                <strong>{money(p.comissao)} comissão bruta</strong></summary>
              <div className="fpw-person-summary">
                <span>Parte própria recebida anteriormente: <b>{money(p.titular_ja_recebido)}</b></span>
                <span>Entrada do clube referente a esta comissão (caixa de {current.responsavel_nome}): <b>{money(p.recebido_clube)}</b></span>
                <span>Diferença bruta sem entrada do clube registrada: <b>{money(p.a_receber_estimado)}</b></span>
                <span>Comissão própria pendente: <b>{money(p.titular_pendente)}</b></span>
                <span>Rateios devidos: <b>{money(p.repasse_total)}</b></span>
                <span>Rateios já pagos: <b>{money(p.repasse_ja_pago)}</b></span>
                <span>Despesas próprias: <b>{money(p.despesas)}</b></span>
                <span>Abatimento de dívida: <b>{money(p.abatido)}</b></span>
              </div>
              <div className="fpw-sales">{p.vendas.map(v=><div key={v.id}>
                <span>{dateBR(v.data)} · {v.titulo||'#'+v.id}</span><strong>{v.comissao===null?'A revisar':money(v.comissao)}</strong>
              </div>)}</div>
            </details>)}
          </div>
        </section>}
        {currentStage===1&&<div className="fpw-next">
          <p className="fpw-help">Confira as vendas e a comissão bruta de cada corretor, sem descontar participantes, gerentes ou despesas. Nenhum pagamento será registrado nesta etapa.</p>
          <button className="cm-button primary" type="button" onClick={()=>setSalesReviewed(true)}>
            Continuar para recebimentos →</button>
        </div>}
        {currentStage===2&&<>
          <section className="com-panel fpw-stage">
            <div className="com-panel-head"><div><h2>2. Dinheiro recebido do clube</h2>
              <p>Recebedor do dinheiro: {current.responsavel_nome}. Escolha a qual corretor a comissão pertence; o valor permanece no caixa do responsável até o repasse efetivo.</p></div>
              <button type="button" className="cm-button primary" onClick={openEntry}>+ Registrar entrada</button></div>
            {current.entradas.length?<div className="fpw-lines">{current.entradas.map(entry=><div key={entry.id}>
              <div><strong>{entry.corretor_nome} · {entry.forma}</strong>
                <small>{dateBR(entry.data_recebimento)} {entry.observacoes&&'· '+entry.observacoes}</small></div>
              <strong>{money(entry.valor)}</strong>
              <button className="vd-outline" type="button" disabled={busy} onClick={()=>action(
                '/api/fechamentos-periodos/'+current.id+'/entradas/'+entry.id+'/excluir',{})}>Retirar</button>
            </div>)}</div>:<div className="com-empty">Nenhum recebimento registrado nesta etapa.</div>}
          </section>
          <section className="com-panel fpw-stage">
            <div className="com-panel-head"><div><h2>Abater empréstimos negociados</h2>
              <p>Opcional. Selecione a dívida de quem pertence ao grupo e informe quanto está abatendo nesta semana.</p></div>
              <button type="button" className="vd-outline" onClick={openAbate}
                disabled={!current.emprestimos?.some(l=>Number(l.saldo)>0)}>+ Abater dívida</button></div>
            {(current.abatimentos||[]).length>0&&<div className="fpw-lines">{current.abatimentos.map(a=><div key={a.id}>
              <div><strong>{a.pessoa_nome}</strong><small>Empréstimo #{a.emprestimo_id}</small></div>
              <strong>{money(a.valor)} abatido</strong>
              <button type="button" className="vd-outline" disabled={busy}
                onClick={()=>action('/api/fechamentos-periodos/'+current.id+'/abates/'+a.id+'/desfazer',{})}>Desfazer rascunho</button>
            </div>)}</div>}
          </section>
          <div className="fpw-next">
            <button type="button" className="vd-outline" onClick={()=>setSalesReviewed(false)}>← Voltar às vendas</button>
            <p className="fpw-help">Após avançar, os recebimentos e abatimentos desta etapa ficam registrados. Confira os valores antes de seguir.</p>
            <button className="cm-button primary" type="button" disabled={busy}
              onClick={()=>action('/api/fechamentos-periodos/'+current.id+'/avancar',{})}>
              Conferir e ir para os pagamentos →</button></div>
        </>}
        {currentStage===3&&<>
          <div className="fpw-next">
            <p className="fpw-help">Precisa corrigir entradas ou abatimentos? Volte antes de registrar pagamentos.</p>
            <button type="button" className="vd-outline" disabled={busy}
              onClick={()=>action('/api/fechamentos-periodos/'+current.id+'/voltar',{})}>← Voltar aos recebimentos</button>
          </div>
          <section className="com-panel fpw-stage">
            <div className="com-panel-head"><div><h2>3.1 Comissões próprias dos corretores titulares</h2>
              <p>Quem recebeu o dinheiro do clube foi {current.responsavel_nome}. Só registre uma baixa aqui quando o titular efetivamente receber sua parte; recebimento centralizado não é pagamento ao titular. O abatimento de dívida não movimenta dinheiro.</p></div></div>
            <div className="fpw-payees">
              {current.corretores.map(p=><article key={p.pessoa_id}>
                <div><strong>{p.nome}</strong><small>Parte própria {money(p.titular_total)} · Já liquidado {money(p.titular_ja_recebido)}</small></div>
                <div><strong>{money(p.titular_pendente)} pendente</strong>
                  <button type="button" className="cm-button primary" disabled={busy||Number(p.titular_pendente)<=0}
                    onClick={()=>openPay({
                      pessoa_id:p.pessoa_id,nome:p.nome,total:p.titular_total,
                      pago:p.titular_ja_recebido,pendente:p.titular_pendente,
                    },'titular')}>Registrar pagamento da comissão</button></div>
              </article>)}
            </div>
          </section>
          <section className="com-panel fpw-stage">
            <div className="com-panel-head"><div><h2>3. Pagar corretores, atendentes e gerentes</h2>
              <p>Você informa como pagou cada pessoa. Os valores são baixados nas participações das vendas deste fechamento.</p></div></div>
            <div className="fpw-payees">
              {current.participantes.length?current.participantes.map(p=><article key={p.pessoa_id}>
                <div><strong>{p.nome}</strong><small>Comissão {money(p.total)} · Já pago {money(p.pago)}</small></div>
                <div><strong>{money(p.pendente)} pendente</strong>
                  <button type="button" className="cm-button primary" disabled={busy||Number(p.pendente)<=0}
                    onClick={()=>openPay(p)}>Registrar pagamento</button></div>
              </article>):<div className="com-empty">Não existem rateios a pagar para as vendas deste período.</div>}
            </div>
          </section>
          <div className="fpw-next"><p className="fpw-help">Pode concluir mesmo com saldos pendentes: eles continuarão indicados no histórico, sem baixa fictícia.</p>
            <button type="button" className="cm-button primary" disabled={busy}
              onClick={()=>{setModal('confirmar')}}>Concluir fechamento e guardar relatório →</button></div>
        </>}
        {(currentStage===3||currentStage===4)&&paymentsByPerson.length>0&&
          <section className="com-panel fpw-stage fpw-payment-history">
            <div className="com-panel-head"><div><h2>Pagamentos registrados por pessoa</h2>
              <p>Comissões próprias e participações agrupadas por beneficiário. Cada lançamento e sua situação continuam identificados.</p></div></div>
            <div className="fpw-payment-groups">
              {paymentsByPerson.map(person=><article key={person.id} className="fpw-payment-person">
                <div className="fpw-payment-person-head">
                  <strong>{person.nome}</strong>
                  <span>{money(person.totalCent/100)} confirmado · {person.entries.length} lançamento(s)</span>
                </div>
                <div className="fpw-lines">{person.entries.map(m=><div key={m.key}>
                  <div><strong>{m.kind==='titular'?'Comissão própria':'Participação de outra venda'} · {m.forma_nome}</strong>
                    <small>{m.situacao==='ATIVO'?'Pagamento confirmado':'Estornado'} · {m.kind==='titular'?'Venda #'+m.operacao_id:'Rateio #'+m.rateio_id}</small></div>
                  <strong>{money(m.valor)}</strong>
                  {current.status==='REPASSES'&&m.situacao==='ATIVO'&&
                    (m.kind!=='titular'||m.forma_nome!=='Abatimento de empréstimo')&&
                    <button type="button" className="vd-outline" onClick={()=>{
                      setRecord({id:m.id,justificativa:'',isTitular:m.kind==='titular'})
                      setModal('estorno')
                    }}>Estornar</button>}
                </div>)}</div>
              </article>)}
            </div>
          </section>}
        {currentStage===4&&<section className="com-panel fpw-report" id="splash-fechamento-relatorio">
          <div className="com-panel-head"><div><h2>4. Resultado do período</h2>
            <p>Valores recebidos e pagos realmente registrados; resultado gerencial por corretor, sem somar lucros de pessoas distintas.</p></div>
            <button type="button" className="vd-outline fpw-print" onClick={printReport}>
              Imprimir / salvar em PDF</button></div>
          <div className="fpw-report-sums">
            <div><span>Entradas do clube no caixa de {current.responsavel_nome}</span><strong>{money(current.resumo.recebido_clube)}</strong></div>
            <div><span>Comissão bruta sem entrada do clube registrada*</span><strong>{money(current.resumo.a_receber_estimado)}</strong></div>
            <div><span>Pagamentos realizados no fechamento</span><strong>{money(current.resumo.pagamentos_periodo)}</strong></div>
            <div><span>Dívidas compensadas (sem dinheiro)</span><strong>{money(current.resumo.abatido_dividas)}</strong></div>
            <div><span>Saldo das entradas após pagamentos</span><strong>{money(current.resumo.saldo_caixa_registrado)}</strong></div>
            <div><span>Despesas pessoais lançadas no período</span><strong>{money(current.resumo.despesas)}</strong></div>
            <div><span>Resultado estimado dos corretores do grupo</span><strong>{money(groupResult)}</strong></div>
          </div>
          <div className="fpw-report-persons">{peopleReport.map(p=><div key={p.pessoa_id}>
            <strong>{p.nome}</strong>
            <div className="fpw-report-breakdown">
              <span>Comissão das próprias vendas: <b>{money(p.comissao)}</b></span>
              <span>Participações em outras vendas: <b>{money(p.participacoes_total)}</b> (já recebidas: {money(p.participacoes_recebidas)})</span>
              <span>Repasses devidos a outros participantes: <b>{money(p.repasse_total)}</b></span>
              <span>Despesas pessoais: <b>{money(p.despesas)}</b></span>
            </div>
            <b>Resultado estimado: {money(p.resultado_estimado)}</b>
          </div>)}</div>
          {paymentsByPerson.length>0&&<div className="fpw-print-payments">
            <h3>Pagamentos confirmados por pessoa</h3>
            {paymentsByPerson.map(p=><div key={p.id}>
              <strong>{p.nome} — {money(p.totalCent/100)}</strong>
              {p.entries.map(m=><p key={m.key}>
                {m.kind==='titular'?'Comissão própria':'Participação'} · {m.forma_nome} ·
                {m.situacao==='ATIVO'?' Confirmado':' Estornado'} · {money(m.valor)}
              </p>)}
            </div>)}
          </div>}
          <p className="fpw-help">* Diferença entre comissão bruta e entradas do clube registradas. Não é cobrança automática: Pix anteriores e valores retidos podem exigir conferência. Pagamentos ao titular e abatimentos de empréstimos não são recebimentos do clube. Valores pagos a um titular só devem ser baixados depois da transferência efetiva.</p>
        </section>}
      </>}
    </>}
    {modal&&<SurfaceModal eyebrow="SPLASH / FECHAMENTOS"
      title={modal==='entrada'?'Recebimento do clube':modal==='abate'?'Abater empréstimo':
        modal==='pagamento'?'Pagamento ao participante':modal==='estorno'?'Estornar pagamento':
        modal==='vinculos'?'Responsabilidade dos corretores':'Concluir fechamento'}
      onClose={closeModal} busy={busy}>
      {modal==='entrada'&&<form className="fpw-modal-form" onSubmit={saveEntry}>
        <label>De qual corretor é esta comissão? *
          <FormControl type="select" value={record.pessoa_id} onChange={v=>setRecord(s=>({...s,pessoa_id:v,valor:suggestedAmount(current?.corretores?.find(p=>String(p.pessoa_id)===v)?.a_receber_estimado)}))}
            options={(current?.corretores||[]).map(p=>({value:String(p.pessoa_id),label:p.nome}))}/></label>
        <div className="fpw-two">
          <label>Forma de recebimento *
            <FormControl type="select" value={record.forma_id} onChange={v=>setRecord(s=>({...s,forma_id:v}))}
              options={methods.map(x=>({value:String(x.id),label:x.nome}))}/></label>
          <label>Data * <FormControl type="date" value={record.data} onChange={v=>setRecord(s=>({...s,data:v}))}/></label>
        </div>
        <label>Valor realmente recebido (R$) *
          <input inputMode="decimal" placeholder="Ex.: 3.000,00" value={record.valor} required
            onChange={e=>setRecord(s=>({...s,valor:e.target.value}))}/></label>
        <label>Observações <textarea rows={2} maxLength={500} value={record.obs}
          onChange={e=>setRecord(s=>({...s,obs:e.target.value}))}/></label>
        <div className="fpw-actions">
          <button type="button" className="vd-outline" onClick={closeModal}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Registrar entrada</button>
        </div>
      </form>}
      {modal==='abate'&&<form className="fpw-modal-form" onSubmit={saveAbate}>
        <p className="fpw-help">O abatimento reduz a dívida da pessoa e NÃO entra como dinheiro recebido do clube.</p>
        <label>Empréstimo *
          <FormControl type="select" value={record.emprestimo_id} onChange={v=>{
               const selected=(current?.emprestimos||[]).find(l=>String(l.id)===v)
               const due=current?.corretores?.find(p=>String(p.pessoa_id)===String(selected?.pessoa_id))
               setRecord(s=>({...s,emprestimo_id:v,valor:suggestedAmount(Math.min(Number(selected?.saldo||0),Number(due?.titular_pendente||0)))}))
             }}
            options={(current?.emprestimos||[]).filter(l=>Number(l.saldo)>0)
              .map(l=>({value:String(l.id),label:l.pessoa_nome+' · Empréstimo #'+l.id+' · Falta '+money(l.saldo)}))}
            placeholder="Selecione a dívida"/></label>
        <div className="fpw-two">
          <label>Valor abatido (R$) *
            <input inputMode="decimal" placeholder="Ex.: 50,00" required value={record.valor}
              onChange={e=>setRecord(s=>({...s,valor:e.target.value}))}/></label>
          <label>Data * <FormControl type="date" value={record.data} onChange={v=>setRecord(s=>({...s,data:v}))}/></label>
        </div>
        <div className="fpw-actions"><button type="button" className="vd-outline" onClick={closeModal}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Confirmar abatimento</button></div>
      </form>}
      {modal==='pagamento'&&<form className="fpw-modal-form" onSubmit={savePay}>
        <p className="fpw-help">{payee?.nome} · Total {money(payee?.total)} · Já pago {money(payee?.pago)} · Falta {money(payee?.pendente)}</p>
        <label>Data do pagamento * <FormControl type="date" value={record.data} onChange={v=>setRecord(s=>({...s,data:v}))}/></label>
        {payMethods.map((item,i)=><div className="fpw-two fpw-method" key={i}>
          <label>Forma *
            <FormControl type="select" value={item.forma_id} onChange={v=>setPayMethods(old=>old.map((x,j)=>i===j?{...x,forma_id:v}:x))}
              options={methods.map(m=>({value:String(m.id),label:m.nome}))}/></label>
          <label>Valor (R$) *
            <input inputMode="decimal" value={item.valor} placeholder="Ex.: 40,00" required
              onChange={e=>setPayMethods(old=>old.map((x,j)=>i===j?{...x,valor:e.target.value}:x))}/></label>
          {payMethods.length>1&&<button type="button" className="vd-outline"
            onClick={()=>setPayMethods(old=>old.filter((_,j)=>j!==i))}>Retirar</button>}
        </div>)}
        <button type="button" className="vd-outline" disabled={payMethods.length>=8}
          onClick={()=>setPayMethods(old=>{
             const allocated=old.reduce((n,x)=>n+(Number(cleanMoney(x.valor))||0),0)
             const remainder=Math.max(0,Number(payee?.pendente||0)-allocated)
             return [...old,{forma_id:String(methods[0]?.id||''),valor:suggestedAmount(remainder)}]
           })}>+ Outra forma</button>
        <p className="fpw-help">Total informado: {money(payMethods.reduce((n,x)=>n+(Number(cleanMoney(x.valor))||0),0))}.</p>
        <div className="fpw-actions"><button type="button" className="vd-outline" onClick={closeModal}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Confirmar pagamento realizado</button></div>
      </form>}
      {modal==='estorno'&&<form className="fpw-modal-form" onSubmit={saveReversal}>
        <p className="fpw-help">O pagamento não será apagado. Um lançamento de estorno ficará no histórico e a participação voltará a ter saldo pendente.</p>
        <label>Justificativa *
          <textarea value={record.justificativa||''} rows={3} maxLength={500} required
            onChange={e=>setRecord(x=>({...x,justificativa:e.target.value}))}
            placeholder="Explique a correção"/></label>
        <div className="fpw-actions"><button type="button" className="vd-outline" onClick={closeModal}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Confirmar estorno</button></div>
      </form>}
      {modal==='vinculos'&&admin&&<form className="fpw-modal-form" onSubmit={saveLink}>
        <p className="fpw-help">Vincule somente corretores que você realmente administra. Os demais continuarão independentes e farão o próprio fechamento. Isso é diferente do dono da corrente do cliente.</p>
        <label>Corretor a configurar *
          <FormControl type="select" value={link.child} onChange={v=>setLink({child:v,boss:String(accounts.find(a=>String(a.id)===v)?.responsavel_id||'')})}
            options={accounts.map(x=>({value:String(x.id),label:x.nome}))} placeholder="Escolha o corretor"/></label>
        <label>Responsável pelos fechamentos
          <FormControl type="select" value={link.boss} onChange={v=>setLink(s=>({...s,boss:v}))}
            options={[{value:'',label:'Independente — faz o próprio fechamento'},
              ...accounts.filter(x=>String(x.id)!==link.child&&x.pode_fechar)
                .map(x=>({value:String(x.id),label:x.nome}))]}/></label>
        <div className="fpw-actions"><button type="button" className="vd-outline" onClick={closeModal}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Salvar responsabilidade</button></div>
      </form>}
      {modal==='confirmar'&&<div className="fpw-modal-form">
        <p>Você confirma que os recebimentos e pagamentos registrados são reais e que saldos pendentes deverão continuar abertos?</p>
        <p className="fpw-help">A conclusão congela o relatório. Não apaga saldos de comissões ainda devidos.</p>
        <div className="fpw-actions"><button type="button" className="vd-outline" onClick={closeModal}>Voltar</button>
          <button className="cm-button primary" type="button" disabled={busy}
            onClick={()=>action('/api/fechamentos-periodos/'+current.id+'/concluir',{})}>Concluir e guardar</button></div>
      </div>}
    </SurfaceModal>}
  </div>
}
