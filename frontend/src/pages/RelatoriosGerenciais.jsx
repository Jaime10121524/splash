import {useEffect,useState} from 'react'
import {comercialGet,localDateISO,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {apiUrl} from '../lib/nativeApi.js'
import './Relatorios.css'
import './RelatoriosGerenciais.css'

const tipos=[
 {value:'VENDAS',label:'Vendas por período',help:'Vendas registradas, titulares, valores e situação dos fechamentos.'},
 {value:'COMISSOES',label:'Comissões por pessoa',help:'Comissões apuradas, liquidadas e saldos devidos a cada participante.'},
 {value:'ATENDIMENTOS',label:'Atendimentos',help:'Entradas, responsáveis, duração e resultados dos atendimentos.'},
 {value:'PENDENCIAS',label:'Pendências e retornos',help:'Negociações abertas e datas previstas para contato.'},
 {value:'TITULOS',label:'Títulos a vencer',help:'Carteira atual filtrada pela data de vencimento.'},
]
const moneyHeads=new Set(['Valor da venda','Comissão bruta','Comissões','Liquidado','A receber','Valor previsto'])
const shortDate=/^\d{4}-\d{2}-\d{2}$/
function present(key,val){
 if(val===null||val===undefined||val==='')return '—'
 if(moneyHeads.has(key) && !Number.isNaN(Number(val)))
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(val))
 if(shortDate.test(String(val)))return dateBR(val)
 return String(val)
}
export default function RelatoriosGerenciais(){
 const now=localDateISO()
 const [type,setType]=useState('VENDAS')
 const [start,setStart]=useState(now.slice(0,7)+'-01')
 const [end,setEnd]=useState(now)
 const [person,setPerson]=useState('')
 const [people,setPeople]=useState([])
 const [lastParams,setLastParams]=useState(null)
 const [data,setData]=useState(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 useEffect(()=>{
  let mounted=true
  comercialGet('/api/pessoas').then(r=>{
   if(mounted)setPeople((r.pessoas||[]).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')))
  }).catch(()=>{});return()=>{mounted=false}
 },[])
 const changeType=value=>{setType(value);setData(null);setLastParams(null)}
 const pdfUrl=lastParams?apiUrl('/api/relatorios/gerenciais/pdf?'+lastParams):null
 async function pesquisar(event){
  event.preventDefault();setError('');setData(null);setLastParams(null)
  if(!start||!end||start>end)return setError('Informe a data inicial e final do período, em ordem válida.')
  const params=new URLSearchParams({tipo:type,inicio:start,fim:end})
  if(person)params.set('pessoa_id',person)
  setBusy(true)
  try{
   const response=await comercialGet('/api/relatorios/gerenciais?'+params)
   setData(response);setLastParams(params.toString())
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 const columns=Object.keys(data?.linhas?.[0]||{})
 const selected=tipos.find(t=>t.value===type)
 return <section className="com-panel rg-panel">
  <div className="rg-panel-title">
   <div><span className="rg-eyebrow">CONSULTA GERENCIAL</span><h2>Escolha um relatório</h2>
    <p>Filtros objetivos, resultados organizados e arquivo PDF pronto para impressão.</p></div>
   <span className="rg-file-tag">PDF · A4 profissional</span>
  </div>
  <form onSubmit={pesquisar} className="rg-form">
   <div className="rg-form-grid">
    <label className="rg-report-field">Tipo de relatório
     <FormControl type="select" value={type} onChange={changeType} options={tipos}/>
    </label>
    <label>Data inicial <FormControl type="date" value={start} onChange={v=>{setStart(v);setData(null)}}/></label>
    <label>Data final <FormControl type="date" value={end} onChange={v=>{setEnd(v);setData(null)}}/></label>
    <label className="rg-person">Participante
     <FormControl type="select" value={person} onChange={v=>{setPerson(v);setData(null)}}
      options={[{value:'',label:'Todos os participantes'},...people.map(p=>({value:String(p.id),label:p.nome}))]}/>
    </label>
   </div>
   <div className="rg-form-footer">
    <p>{selected?.help}</p>
    <button type="submit" className="rg-generate" disabled={busy}>
     {busy?'Consultando...':'Gerar relatório'}
     <span aria-hidden="true">→</span>
    </button>
   </div>
  </form>
  {error&&<p className="com-alert error" role="alert">{error}</p>}
  {data&&<section className="rg-result" aria-label="Resultado do relatório">
   <div className="rg-result-head">
    <div><span className="rg-eyebrow">RESULTADO</span>
     <h3>{tipos.find(t=>t.value===data.tipo)?.label}</h3>
     <p>{dateBR(data.inicio)} a {dateBR(data.fim)} · {data.linhas.length} registro(s)</p>
    </div>
    {pdfUrl&&<a className="rg-download" href={pdfUrl} target="_blank" rel="noopener noreferrer">
      <span aria-hidden="true">↓</span> Abrir / salvar PDF
    </a>}
   </div>
   {data.linhas.length===0?<div className="rg-no-data">
    <strong>Nenhum registro encontrado</strong>
    <p>Altere o período ou os filtros para ampliar sua pesquisa.</p>
   </div>:<div className="rg-table-wrap">
    <table className="rg-table">
     <thead><tr>{columns.map(col=><th key={col} className={moneyHeads.has(col)?'amount':''}>{col}</th>)}</tr></thead>
     <tbody>{data.linhas.map((row,index)=><tr key={index}>
      {columns.map(col=><td key={col} className={moneyHeads.has(col)?'amount':''}>{present(col,row[col])}</td>)}
     </tr>)}</tbody>
    </table>
   </div>}
   {data.truncado&&<p className="rg-limited">Limite de 1.000 registros. Selecione um intervalo menor para evitar um relatório incompleto.</p>}
  </section>}
 </section>
}
