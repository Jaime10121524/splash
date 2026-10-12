import {useState} from 'react'
import {comercialGet,localDateISO,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './Relatorios.css'

const tipos=[
 {value:'VENDAS',label:'Vendas por período'},
 {value:'COMISSOES',label:'Comissões por pessoa'},
 {value:'ATENDIMENTOS',label:'Atendimentos'},
 {value:'PENDENCIAS',label:'Pendências e retornos'},
 {value:'TITULOS',label:'Títulos a vencer'},
]
function imprimir(){
 const section=document.getElementById('rel-gerencial-folha')
 if(!section)return
 const popup=window.open('','_blank','width=940,height=760')
 if(!popup)return window.alert('Autorize a janela de impressão para gerar o relatório.')
 const css='<style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;margin:0;color:#18223b;background:white}h2{font-size:19px;margin:8px 0}.hint{color:#657087}.brand{color:#6853d2;font-weight:bold;letter-spacing:1px}table{border-collapse:collapse;width:100%;table-layout:auto}th{background:#ece8ff;color:#252040}th,td{text-align:left;border-bottom:1px solid #e5e5eb;padding:8px 7px;overflow-wrap:anywhere;font-size:10px}tr{break-inside:avoid}header{display:flex;justify-content:space-between;margin-bottom:15px;gap:12px}small{font-size:10px}@media print{*{-webkit-print-color-adjust:exact}}</style>'
 popup.document.open()
 popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>SPLASH - Relatório Gerencial</title>'+css+'</head><body>'+section.innerHTML+'</body></html>')
 popup.document.close()
 let printed=false
 const doPrint=()=>{if(printed)return;printed=true;popup.focus();popup.print()}
 popup.addEventListener('load',doPrint,{once:true})
 if(popup.document.readyState==='complete')setTimeout(doPrint,350)
}
export default function RelatoriosGerenciais(){
 const today=localDateISO()
 const [type,setType]=useState('VENDAS')
 const [start,setStart]=useState(today.slice(0,7)+'-01')
 const [end,setEnd]=useState(today)
 const [person,setPerson]=useState('')
 const [data,setData]=useState(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 async function pesquisar(e){
  e.preventDefault();setError('');setData(null)
  if(!start||!end||start>end)return setError('Informe um período válido.')
  setBusy(true)
  try{
    const params=new URLSearchParams({tipo:type,inicio:start,fim:end})
    if(person.trim())params.set('pessoa_id',person.trim())
    setData(await comercialGet('/api/relatorios/gerenciais?'+params))
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 const columns=data?.linhas?.length?Object.keys(data.linhas[0]):[]
 return <section className="com-panel rel-selector" style={{marginBottom:18}}>
  <div className="rel-section-heading"><h2>Relatórios gerenciais</h2><small>Somente administrador · impressão A4</small></div>
  <form className="rel-filters" onSubmit={pesquisar} style={{gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))'}}>
    <label>Relatório
      <FormControl type="select" value={type} onChange={v=>{setType(v);setData(null)}}
       options={tipos}/></label>
    <label>Data inicial <FormControl type="date" value={start} onChange={setStart}/></label>
    <label>Data final <FormControl type="date" value={end} onChange={setEnd}/></label>
    <label>Filtrar por pessoa (código opcional)
      <input type="number" min="1" placeholder="Todas" value={person} onChange={e=>setPerson(e.target.value)}/></label>
    <button type="submit" className="rel-print" disabled={busy}>{busy?'Consultando...':'Gerar relatório'}</button>
  </form>
  {error&&<p role="alert" className="com-alert error">{error}</p>}
  {data&&<div style={{display:'grid',gap:14}}>
    <div className="rel-report-head">
      <div><strong>{tipos.find(t=>t.value===data.tipo)?.label}</strong>
        <p>Período de {dateBR(data.inicio)} até {dateBR(data.fim)} · {data.linhas.length} registros</p></div>
      <button className="rel-print" type="button" onClick={imprimir}>Imprimir / Salvar PDF</button>
    </div>
    <div className="rel-table-scroll"><table className="rel-table">
      <thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead>
      <tbody>{data.linhas.map((row,i)=><tr key={i}>{columns.map(c=><td key={c}>{row[c]??'—'}</td>)}</tr>)}</tbody>
    </table></div>
    {data.truncado&&<p className="rel-help">Limite de 1000 registros. Restrinja o período para ver todos.</p>}
    <div id="rel-gerencial-folha" style={{display:'none'}}>
      <header><div><span className="brand">SPLASH · AHRITECH</span>
        <h2>{tipos.find(t=>t.value===data.tipo)?.label}</h2>
        <p className="hint">Período: {dateBR(data.inicio)} a {dateBR(data.fim)}</p></div>
        <small>{data.linhas.length} registros</small></header>
      <table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead>
      <tbody>{data.linhas.map((row,i)=><tr key={i}>{columns.map(c=><td key={c}>{row[c]??'—'}</td>)}</tr>)}</tbody></table>
    </div>
  </div>}
 </section>
}
