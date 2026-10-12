import {useEffect,useMemo,useState} from 'react'
import {comercialGet,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import './ComercialPages.css'
import './MinhasVendas.css'

const reais=v=>v===null||v===undefined?'A apurar':
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v))
const statuses={
  QUITADA:'Comissão quitada',
  PARCIAL:'Pagamento parcial',
  A_RECEBER:'A receber',
  A_APURAR:'A apurar',
  EM_APURACAO:'Em apuração',
  SEM_COMISSAO:'Sem comissão',
}
const roles={
  TITULAR:'Corretor titular',
  CORRETOR:'Segundo corretor',
  ATENDENTE:'Atendimento',
  GERENTE:'Gerência',
  PARTICIPACAO:'Participação',
}

function Values({comissao,compact=false}){
  const items=[
    ['Ganhou',comissao.direito],
    ['Recebido',comissao.recebido],
    ['Abatido',comissao.abatido],
    ['Liquidado',comissao.liquidado],
    ['A receber',comissao.pendente],
  ]
  return <div className={'mv-values'+(compact?' compact':'')}>
    {items.map(([title,amount])=><div key={title} className={title==='A receber'?'mv-due':''}>
      <span>{title}</span><strong>{reais(amount)}</strong>
    </div>)}
  </div>
}

export default function MinhasVendas({role='corretor',navigate}){
  const [draft,setDraft]=useState('')
  const [q,setQ]=useState('')
  const [start,setStart]=useState('')
  const [end,setEnd]=useState('')
  const [status,setStatus]=useState('TODOS')
  const [page,setPage]=useState(1)
  const [rows,setRows]=useState([])
  const [summary,setSummary]=useState({})
  const [hasMore,setHasMore]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [reload,setReload]=useState(0)
  const [detail,setDetail]=useState(null)
  const [detailBusy,setDetailBusy]=useState(false)
  const [detailError,setDetailError]=useState('')

  useEffect(()=>{
    const timeout=setTimeout(()=>{setQ(draft.trim());setPage(1)},300)
    return ()=>clearTimeout(timeout)
  },[draft])

  const dateValid=(!start&&!end)||!!(start&&end&&start<=end)
  const query=useMemo(()=>{
    const params=new URLSearchParams({pagina:String(page)})
    if(q)params.set('q',q)
    if(start&&end&&start<=end){params.set('inicio',start);params.set('fim',end)}
    return params.toString()
  },[q,start,end,page])

  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    comercialGet('/api/minhas-vendas?'+query).then(data=>{
      if(!active)return
      setRows(data.vendas||[]);setSummary(data.resumo_pagina||{})
      setHasMore(!!data.tem_mais)
    }).catch(e=>{if(active){setRows([]);setHasMore(false);setError(e.message)}})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[query,reload])

  const filtered=rows.filter(item=>status==='TODOS'||item.comissao?.situacao===status)
  const ownerLabel=role==='vendedor'?'Seus atendimentos e comissões':
    role==='gerente'?'Suas vendas e comissões de gerência':'Suas vendas e participações'
  async function openDetails(row){
    setDetailError('');setDetailBusy(true);setDetail(null)
    try{
      const res=await comercialGet('/api/minhas-vendas/'+row.id)
      setDetail(res.venda)
    }catch(e){setDetailError(e.message)}
    finally{setDetailBusy(false)}
  }

  return <div className="com-page mv-page">
    <header className="com-heading mv-heading">
      <div><span className="com-eyebrow">SPLASH / VENDAS</span>
        <h1>Minhas vendas</h1>
        <p>{ownerLabel}. Somente as participações vinculadas ao seu acesso, sem dados pessoais de associados ou informações financeiras de terceiros.</p>
      </div>
    </header>
    <section className="mv-metrics" aria-label="Totais da página">
      {[
        {label:'Vendas na página',value:summary.vendas??0},
        {label:'Comissões em apuração',value:summary.a_apurar??0},
        {label:'Liquidado nesta página',value:reais(summary.liquidado??'0.00')},
        {label:'A receber nesta página',value:reais(summary.a_receber??'0.00'),accent:true},
      ].map(entry=><div className={'mv-metric'+(entry.accent?' accent':'')} key={entry.label}>
        <span>{entry.label}</span><strong>{entry.value}</strong>
      </div>)}
    </section>

    <section className="com-panel mv-panel">
      <div className="com-panel-head">
        <div><h2>Consultar minhas vendas</h2><p>Use o número ou a sigla do título, data e situação da sua comissão.</p></div>
        <span className="com-count">{filtered.length} na página {page}</span>
      </div>
      <div className="mv-filters">
        <label className="mv-search">Pesquisar título
          <input type="search" value={draft} onChange={e=>setDraft(e.target.value)}
            placeholder="Ex.: 1567 ou R/T" aria-label="Pesquisar por número ou sigla"/></label>
        <label>Data inicial <FormControl type="date" value={start}
          onChange={v=>{setStart(v);setPage(1)}}/></label>
        <label>Data final <FormControl type="date" value={end}
          onChange={v=>{setEnd(v);setPage(1)}}/></label>
        <label>Minha comissão
          <FormControl type="select" value={status} onChange={setStatus}
            options={[
              {value:'TODOS',label:'Todas as situações'},
              {value:'A_RECEBER',label:'A receber'},
              {value:'PARCIAL',label:'Pagamento parcial'},
              {value:'QUITADA',label:'Quitada'},
              {value:'A_APURAR',label:'A apurar'},
              {value:'EM_APURACAO',label:'Em apuração'},
              {value:'SEM_COMISSAO',label:'Sem comissão'},
            ]}/></label>
      </div>
      {!dateValid&&<p className="mv-note">Para aplicar o filtro de datas, informe um intervalo válido com data inicial e final.</p>}
      {error&&<div className="com-alert error" role="alert">{error}
        <button type="button" onClick={()=>setReload(n=>n+1)}>Tentar novamente</button></div>}
      {loading?<div className="com-empty">Carregando as suas vendas...</div>
      :filtered.length===0?<div className="com-empty"><strong>Nenhuma venda encontrada.</strong>
          <p>Verifique os filtros. Vendas sem rateio podem aparecer como “A apurar”.</p></div>
      :<div className="mv-list">
        {filtered.map(item=><article className="mv-sale" key={item.id}>
          <div className="mv-sale-head">
            <div className="mv-title"><strong>Título {item.titulo||'#'+item.id}</strong>
              <span className={'mv-pill status-'+item.comissao.situacao.toLowerCase()}>
                {statuses[item.comissao.situacao]||'Em apuração'}</span></div>
            <span className="mv-date">{dateBR(item.data_venda)}</span>
          </div>
          <div className="mv-sale-desc">
            <span>{item.comissao.papeis.map(p=>roles[p]||'Participação').join(' · ')}</span>
            <span>Cliente: {item.cliente_quitou?'pagamento concluído':'pagamento pendente'}</span>
            {item.fechamento_concluido_id&&<span>Fechamento #{item.fechamento_concluido_id} concluído</span>}
          </div>
          <Values comissao={item.comissao} compact/>
          <div className="mv-sale-actions">
            <button type="button" onClick={()=>openDetails(item)} disabled={detailBusy}>Ver meu extrato</button>
          </div>
        </article>)}
      </div>}
      <div className="mv-pagination">
        <span>Resultados da página {page}. O filtro de situação considera os registros carregados nesta página.</span>
        <div>
          <button type="button" disabled={page<=1||loading} onClick={()=>setPage(x=>Math.max(1,x-1))}>Anterior</button>
          <button type="button" disabled={!hasMore||loading} onClick={()=>setPage(x=>x+1)}>Próxima</button>
        </div>
      </div>
    </section>
    <p className="com-disclaimer">
      Recebimentos do clube e do cliente não são pagamentos da sua comissão.
      Apenas pagamentos realizados e abatimentos registrados reduzem seu saldo a receber.
      Fechamentos em andamento não são apresentados como concluídos.
    </p>
    {(detailBusy||detailError||detail)&&<SurfaceModal
      eyebrow="SPLASH / MINHAS VENDAS" title="Meu extrato da venda"
      subtitle={detail?.titulo?'Título '+detail.titulo:undefined}
      onClose={()=>{setDetail(null);setDetailError('')}} busy={detailBusy}>
      {detailBusy?<div className="com-empty">Carregando seu extrato...</div>:
      detailError?<div className="com-alert error" role="alert">{detailError}</div>:
      detail&&<div className="mv-detail">
        <div className="mv-detail-meta">
          <div><span>Data da venda</span><strong>{dateBR(detail.data_venda)}</strong></div>
          <div><span>Validade do título</span><strong>{dateBR(detail.data_vencimento)}</strong></div>
          <div><span>Participação</span><strong>{detail.comissao.papeis.map(p=>roles[p]||'Participação').join(', ')}</strong></div>
          <div><span>Situação</span><strong>{statuses[detail.comissao.situacao]||'Em apuração'}</strong></div>
        </div>
        <Values comissao={detail.comissao}/>
        <section className="mv-history">
          <h3>Meus pagamentos e abatimentos</h3>
          {!detail.comissao.movimentos.length?<p className="mv-note">Não existem pagamentos ou abatimentos confirmados para você nesta venda.</p>:
          <div className="mv-history-list">{detail.comissao.movimentos.map((entry,i)=>
            <div key={entry.papel+'-'+entry.id+'-'+i} className="mv-history-row">
              <div><strong>{entry.tipo==='ESTORNO'?'Estorno':entry.forma==='ABATIMENTO'?'Abatimento de empréstimo':'Pagamento'}</strong>
                <small>{dateBR(entry.data)} · {roles[entry.papel]||'Participação'}</small></div>
              <strong className={entry.tipo==='ESTORNO'?'reversed':''}>
                {entry.tipo==='ESTORNO'?'−':'+'}{reais(entry.valor)}</strong>
            </div>)}</div>}
        </section>
        {detail.fechamento_concluido_id&&<p className="mv-note">
          Este valor pertence ao fechamento concluído #{detail.fechamento_concluido_id}.
          Consulte o menu Relatórios para obter o demonstrativo individual.
        </p>}
        <div className="cm-form-actions">
          <button type="button" className="cm-button" onClick={()=>setDetail(null)}>Fechar</button>
          <button type="button" className="cm-button primary" onClick={()=>{
            setDetail(null);navigate?.('financeiro')
          }}>Meu financeiro</button>
        </div>
      </div>}
    </SurfaceModal>}
  </div>
}
