import {useEffect,useState} from 'react'
import {comercialGet,dateBR} from '../lib/comercialApi.js'
import './AuditoriaRateios.css'

const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
  .format(Number(value||0))
const statusText={
  APTA:'Apta a constar no Financeiro',
  VENDA_NAO_QUITADA:'Venda ainda não quitada',
  AGUARDANDO_APURACAO:'Comissão aguardando apuração',
  SEM_COMISSAO:'Comissão não definida',
  OPERACAO_ALTERADA:'Situação da venda alterada',
}
function Sale({sale}){
  const state=sale.revisar?'Revisar distribuição':statusText[sale.status_financeiro]||'Conferir'
  return <details className={'aud-sale '+(sale.revisar?'aud-sale-issue':'')} open={sale.revisar}>
    <summary>
      <span className="aud-sale-name"><strong>{sale.titulo||'Venda #'+sale.operacao_id}</strong>
        <small>{sale.titular_nome} · {dateBR(sale.data_venda)} · {state}</small></span>
      <span className="aud-sale-total">{sale.bruta===null?'A apurar':money(sale.bruta)}</span>
    </summary>
    <div className="aud-sale-content">
      {(sale.motivos||[]).length>0&&<div className="aud-sale-messages">
        {sale.motivos.map((m,i)=><p key={i}>{m}</p>)}
      </div>}
      {sale.bruta!==null&&<>
        <div className="aud-sale-colheads"><span>Beneficiário / participação</span><span>Direito</span><span>Pago</span></div>
        {(sale.participantes||[]).map((p,i)=><div className="aud-sale-person" key={p.pessoa_id+'-'+p.funcao+'-'+i}>
          <div><strong>{p.nome}</strong><small>{p.funcao}</small></div>
          <b>{money(p.valor)}</b><span>{money(p.pago)}</span>
        </div>)}
        <div className="aud-sale-compare">
          <span>Comissão bruta <b>{money(sale.bruta)}</b></span>
          <span>Total dos direitos <b>{money(sale.total_distribuido)}</b></span>
          <span>Diferença <b>{money(sale.diferenca)}</b></span>
        </div>
      </>}
    </div>
  </details>
}
export default function AuditoriaRateios({fechamentoId}){
  const [report,setReport]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    setLoading(true);setError('');setReport(null)
    comercialGet('/api/fechamentos-periodos/'+fechamentoId+'/auditoria-rateios')
      .then(result=>{if(active)setReport(result)})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[fechamentoId])
  return <section className="com-panel aud-root" aria-label="Conferência da distribuição das comissões">
    <div className="com-panel-head"><div><h2>Distribuição por venda</h2>
      <p>Confira a comissão bruta e o que pertence a cada pessoa. Apenas consulta, sem lançar pagamentos.</p>
    </div></div>
    {loading&&<div className="com-empty">Conferindo as vendas do fechamento...</div>}
    {error&&<p role="alert" className="com-alert error">{error}</p>}
    {report&&<div className="aud-content">
      <div className="aud-summary">
        <span>Vendas <strong>{report.resumo.vendas}</strong></span>
        <span>Distribuição conferida e apta <strong>{report.resumo.conferidas}</strong></span>
        <span>Revisar rateio <strong>{report.resumo.revisar}</strong></span>
        <span>Ainda fora do Financeiro <strong>{report.resumo.fora_financeiro}</strong></span>
      </div>
      <p className="aud-explanation">A distribuição segue os rateios registrados na venda. No Financeiro, aparecem apenas as comissões já elegíveis: uma venda ainda não quitada ou não apurada pode constar no fechamento, mas não no extrato de comissões.</p>
      {(report.vendas||[]).length===0?<div className="com-empty">Este fechamento não contém vendas.</div>:
        <div className="aud-sales">{report.vendas.map(s=><Sale key={s.operacao_id} sale={s}/>)}</div>}
      <p className="aud-explanation">Esta conferência não movimenta o caixa, não modifica rateios ou comissões e não substitui os pagamentos efetivamente registrados. A consulta mensal do Financeiro também está limitada às 500 vendas mais recentes do período.</p>
    </div>}
  </section>
}
