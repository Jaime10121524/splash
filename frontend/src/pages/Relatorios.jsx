import {useEffect,useState} from 'react'
import {comercialGet,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './ComercialPages.css'
import './Relatorios.css'

const reais=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0))
const total=(items,key)=>items.reduce((sum,p)=>sum+Math.round(Number(p.resumo?.[key]||0)*100),0)/100

function SummaryCard({title,value,description,accent=false}){
  return <div className={'rel-stat'+(accent?' accent':'')}>
    <span>{title}</span>
    <strong>{reais(value)}</strong>
    {description&&<small>{description}</small>}
  </div>
}
function PersonBlock({person}){
  const [open,setOpen]=useState(false)
  const entries=person.itens||[]
  return <article className="rel-person">
    <div className="rel-person-head">
      <div className="rel-person-info">
        <strong>{person.nome}</strong>
        <span>{entries.length} participação(ões) e comissões do período</span>
      </div>
      <div className="rel-person-balance"><small>A receber</small><strong>{reais(person.resumo.pendente)}</strong></div>
    </div>
    <div className="rel-person-kpis">
      <div><span>Ganhou</span><strong>{reais(person.resumo.total)}</strong></div>
      <div><span>Recebido</span><strong>{reais(person.resumo.recebido)}</strong></div>
      <div><span>Abatido</span><strong>{reais(person.resumo.abatido)}</strong></div>
      <div><span>Liquidado</span><strong>{reais(person.resumo.liquidado)}</strong></div>
    </div>
    <button className="rel-expand no-print" type="button" aria-expanded={open}
      onClick={()=>setOpen(x=>!x)}>{open?'Ocultar participações':'Ver participações por venda'} <span aria-hidden="true">{open?'−':'+'}</span></button>
    <div className={'rel-person-lines'+(open?' open':'')}>
      <div className="rel-table-scroll">
        <table className="rel-table">
          <thead><tr><th>Venda / data</th><th>Função</th><th>Ganhou</th><th>Recebido</th><th>Abatido</th><th>A receber</th></tr></thead>
          <tbody>{entries.map((x,i)=><tr key={x.operacao_id+'-'+x.papel+'-'+i}>
            <td><strong>{x.titulo||'#'+x.operacao_id}</strong><small>{dateBR(x.data)}</small></td>
            <td>{({TITULAR:'Comissão própria',ATENDENTE:'Atendimento',GERENTE:'Gerência',CORRETOR:'Corretor'})[x.papel]||'Participação'}</td>
            <td>{reais(x.valor)}</td><td>{reais(x.recebido)}</td>
            <td>{reais(x.abatido)}</td><td className="rel-pending">{reais(x.pendente)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </article>
}
function SalesBlock({sales}){
  return <section className="rel-section">
    <div className="rel-section-heading"><h3>Vendas e divisão das comissões</h3><small>{sales.length} venda(s) neste fechamento</small></div>
    <div className="rel-sale-list">{sales.map(s=><article className="rel-sale" key={s.operacao_id}>
      <div className="rel-sale-top">
        <div><strong>{s.titulo||'Venda #'+s.operacao_id}</strong>
          <small>{dateBR(s.data)} · {s.titular_nome}{s.cliente_nome?' · Cliente: '+s.cliente_nome:''}</small></div>
        <div className="rel-sale-amount"><span>Comissão bruta</span><strong>{reais(s.bruta)}</strong></div>
      </div>
      <div className="rel-sale-person"><span>Corretor titular · parte própria</span><b>{reais(s.parte_propria)}</b></div>
      {s.participacoes.map((p,i)=><div key={i} className="rel-sale-person">
        <span>{p.nome} · {({ATENDENTE:'Atendimento',GERENTE:'Gerência',CORRETOR:'Corretor'})[p.papel]||p.papel}</span>
        <b>{reais(p.valor)}</b>
        <small>Liquidado {reais(p.pago)} · Pendente {reais(p.pendente)}</small>
      </div>)}
    </article>)}</div>
  </section>
}
export default function Relatorios({role='admin'}){
  const [start,setStart]=useState('')
  const [end,setEnd]=useState('')
  const [list,setList]=useState([])
  const [selected,setSelected]=useState(null)
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [loadingReport,setLoadingReport]=useState(false)
  const [error,setError]=useState('')
  const admin=role==='admin'

  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    const query=start&&end?'?'+new URLSearchParams({inicio:start,fim:end}):''
    comercialGet('/api/relatorios/fechamentos'+query).then(r=>{
      if(!active)return
      const found=r.fechamentos||[]
      setList(found)
      setSelected(old=>old && found.some(f=>f.id===old)?old:null)
      setData(old=>old && found.some(f=>f.id===old.fechamento?.id)?old:null)
    }).catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[start,end])

  async function open(id){
    setSelected(id);setData(null);setError('');setLoadingReport(true)
    try{
      const result=await comercialGet('/api/relatorios/fechamentos/'+id+'/acerto')
      setData(result)
    }catch(e){setError(e.message)}
    finally{setLoadingReport(false)}
  }

  const people=data?.pessoas||[]
  const reportAdmin=!!data?.administrador
  return <div className="com-page rel-page">
    <header className="com-heading rel-screen-head">
      <div><span className="com-eyebrow">SPLASH / RELATÓRIOS</span>
        <h1>{admin?'Relatórios gerenciais':'Meus demonstrativos'}</h1>
        <p>{admin?'Acerto semanal por responsável, vendas e participante. Consulte somente fechamentos concluídos.':
          'Seus direitos e pagamentos serão disponibilizados após o responsável concluir o fechamento.'}</p>
      </div>
    </header>
    <section className="com-panel rel-selector no-print">
      <div className="rel-section-heading"><h2>Acerto semanal</h2><small>Somente fechamentos concluídos</small></div>
      <div className="rel-filters">
        <label>Data inicial <FormControl type="date" value={start} onChange={setStart}/></label>
        <label>Data final <FormControl type="date" value={end} onChange={setEnd}/></label>
      </div>
      {(start&&!end||end&&!start)&&<p className="rel-help">Para filtrar por datas, informe o início e o fim. Deixe ambos vazios para visualizar todo o histórico.</p>}
      {loading?<p className="rel-help">Carregando fechamentos...</p>
      :list.length===0?<div className="rel-empty">{admin?
        'Ainda não há fechamentos concluídos neste período.':
        'Nenhum demonstrativo liberado. Seu relatório aparecerá somente depois da conclusão do fechamento pelo responsável.'}</div>
      :<div className="rel-choices">{list.map(f=><button type="button" key={f.id}
        className={'rel-choice'+(selected===f.id?' active':'')}
        aria-pressed={selected===f.id} onClick={()=>open(f.id)}>
        <span><strong>Fechamento #{f.id}</strong><small>{dateBR(f.inicio)} a {dateBR(f.fim)}</small></span>
        <span><small>Concluído em {dateBR(f.concluido_em,true)}</small><b>{selected===f.id?'Selecionado':'Consultar →'}</b></span>
      </button>)}</div>}
    </section>

    {error&&<p className="com-alert error" role="alert">{error}</p>}
    {loadingReport&&<section className="com-panel rel-empty">Preparando demonstrativo...</section>}
    {data&&!loadingReport&&<section className="com-panel rel-print-sheet" aria-label="Demonstrativo de acerto semanal">
      <div className="rel-report-head">
        <div><div className="rel-report-brand">SPLASH <span>· AHRITECH</span></div>
          <h2>{reportAdmin?'Relatório de acerto semanal':'Demonstrativo individual de comissões'}</h2>
          <p>Fechamento #{data.fechamento.id} · {dateBR(data.fechamento.inicio)} a {dateBR(data.fechamento.fim)}
            {reportAdmin&&data.fechamento.responsavel_nome?' · Responsável: '+data.fechamento.responsavel_nome:''}</p>
        </div>
        <button className="rel-print no-print" type="button" onClick={()=>window.print()}>
          Imprimir / Salvar PDF
        </button>
      </div>

      {reportAdmin&&<section className="rel-section">
        <div className="rel-section-heading"><h3>Movimentação do fechamento</h3><small>Valores efetivamente lançados</small></div>
        <div className="rel-kpis">
          <SummaryCard title="Comissões brutas" value={data.resumo?.comissoes}/>
          <SummaryCard title="Recebido do clube" value={data.resumo?.recebido_clube} description="Entrada de dinheiro no fechamento"/>
          <SummaryCard title="Pagamentos realizados" value={data.resumo?.pagamentos_periodo} description="Saídas registradas no fechamento"/>
          <SummaryCard title="Abatimento de dívidas" value={data.resumo?.abatido_dividas}/>
          <SummaryCard title="Despesas registradas" value={data.resumo?.despesas}/>
          <SummaryCard title="Saldo das entradas" value={data.resumo?.saldo_caixa_registrado} description="Não representa lucro bancário"/>
        </div>
      </section>}
      <section className="rel-section">
        <div className="rel-section-heading"><h3>{reportAdmin?'Direitos por pessoa':'Minhas comissões e participações'}</h3>
          <small>{people.length} pessoa(s)</small></div>
        <div className="rel-kpis">
          <SummaryCard title="Total de direitos" value={total(people,'total')}/>
          <SummaryCard title="Recebido pelas pessoas" value={total(people,'recebido')}/>
          <SummaryCard title="Abatido em empréstimos" value={total(people,'abatido')}/>
          <SummaryCard title="Ainda a receber" value={total(people,'pendente')} accent/>
        </div>
        {people.length===0?<div className="rel-empty">Nenhuma participação individual neste fechamento.</div>
          :<div className="rel-person-list">{people.map(p=><PersonBlock person={p} key={p.pessoa_id}/>)}</div>}
      </section>
      {reportAdmin&&<>
        <SalesBlock sales={data.vendas||[]}/>
        <section className="rel-section">
          <div className="rel-section-heading"><h3>Recebimentos do clube</h3><small>Não são pagamentos pessoais</small></div>
          {(data.entradas||[]).length===0?<p className="rel-help">Nenhuma entrada do clube registrada.</p>
          :<div className="rel-table-scroll"><table className="rel-table">
            <thead><tr><th>Data</th><th>Corretor titular</th><th>Forma</th><th>Valor recebido</th></tr></thead>
            <tbody>{data.entradas.map(e=><tr key={e.id}><td>{dateBR(e.data_recebimento)}</td>
              <td>{e.corretor_nome}</td><td>{e.forma}</td><td>{reais(e.valor)}</td></tr>)}</tbody>
          </table></div>}
        </section>
      </>}
      <p className="rel-footnote">{data.aviso}</p>
      <footer className="rel-report-footer">SPLASH · Relatório emitido em {new Date().toLocaleDateString('pt-BR')} · Fechamento concluído e preservado.</footer>
    </section>}
  </div>
}
