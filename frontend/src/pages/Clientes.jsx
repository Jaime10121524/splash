import { useEffect, useState } from 'react'
import { ClientFields, SurfaceModal, normalizeClient } from '../components/ComercialForms.jsx'
import { comercialGet, comercialPost, dateBR } from '../lib/comercialApi.js'
import './ComercialPages.css'
import { formatPhone } from '../components/PhoneInput.jsx'

export default function Clientes({navigate}) {
  const [rows,setRows]=useState([])
  const [total,setTotal]=useState(0)
  const [page,setPage]=useState(1)
  const [search,setSearch]=useState('')
  const [query,setQuery]=useState('')
  const [catalogs,setCatalogs]=useState({origens:[],motivos:[],pessoas:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [modal,setModal]=useState(null)
  const [fields,setFields]=useState(normalizeClient())
  const [formError,setFormError]=useState('')
  const [history,setHistory]=useState([])
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    comercialGet('/api/comercial/opcoes').then(setCatalogs).catch(e=>setError(e.message))
  },[])
  useEffect(()=>{
    const timeout=setTimeout(()=>{setQuery(search);setPage(1)},250)
    return ()=>clearTimeout(timeout)
  },[search])
  useEffect(()=>{
    let mounted=true
    setLoading(true)
    comercialGet('/api/clientes?limit=25&page='+page+'&q='+encodeURIComponent(query))
      .then(data=>{if(mounted){setRows(data.clientes||[]);setTotal(data.total||0);setError('')}})
      .catch(e=>{if(mounted)setError(e.message)})
      .finally(()=>{if(mounted)setLoading(false)})
    return ()=>{mounted=false}
  },[page,query])

  async function refresh() {
    const data=await comercialGet('/api/clientes?limit=25&page='+page+'&q='+encodeURIComponent(query))
    setRows(data.clientes||[]);setTotal(data.total||0)
  }
  function openClient(client=null) {
    setFields(normalizeClient(client))
    setModal(client||'new')
    setFormError('')
    setNotice('')
  }
  async function openHistory(client) {
    setModal({kind:'history',client})
    setFormError('')
    setHistory([])
    try {const r=await comercialGet('/api/clientes/'+client.id+'/corrente');setHistory(r.historico||[])}
    catch(e){setFormError(e.message)}
  }
  async function save(event) {
    event.preventDefault()
    setSaving(true);setFormError('')
    try{
      const url=modal==='new'?'/api/clientes':'/api/clientes/'+modal.id+'/editar'
      const payload=await comercialPost(url,fields)
      setNotice(payload.message);setModal(null)
      await refresh()
    }catch(e){setFormError(e.message)}
    finally{setSaving(false)}
  }
  const pages=Math.max(1,Math.ceil(total/25))
  return <div className="com-page">
    <header className="com-heading"><div><span className="com-eyebrow">OPERAÇÃO / CLIENTES</span>
      <h1>Clientes</h1><p>Cadastros, indicações e responsáveis pela corrente.</p></div>
      <button className="com-main-button" type="button" onClick={()=>openClient()}>＋ Novo cliente</button></header>
    {notice&&<div className="com-alert success" role="status">{notice}
      <button type="button" onClick={()=>{setNotice('');navigate('atendimentos')}}>Ver atendimentos →</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}
      <button type="button" onClick={()=>{setError('');refresh().catch(e=>setError(e.message))}}>Atualizar</button></div>}
    <section className="com-panel">
      <div className="com-panel-head"><div><h2>Cadastro de clientes</h2><p>Busque por nome, telefone ou CPF.</p></div>
        <span className="com-count">{total} encontrado(s)</span></div>
      <div className="com-toolbar"><input type="search" value={search}
        onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar cliente..." aria-label="Pesquisar clientes"/></div>
      {loading?<div className="com-empty">Carregando clientes...</div>:
        !rows.length?<div className="com-empty"><span>♧</span><strong>Nenhum cliente encontrado</strong>
          <p>Cadastre um novo cliente ou altere a pesquisa.</p></div>:
        <div className="com-client-list">
          {rows.map(c=><article className="com-client" key={c.id}>
            <div className="com-avatar">{c.nome?.trim()?.charAt(0)?.toUpperCase()||'C'}</div>
            <div className="com-client-main">
              <strong>{c.nome}</strong>
              <small>{formatPhone(c.telefone)}{c.cpf?' · CPF '+c.cpf:''}</small>
              <div className="com-client-detail"><span>Corrente: <b>{c.dono_corrente_nome||'Não informado'}</b></span>
                {c.indicador_nome&&<span>Indicação: <b>{c.indicador_nome}</b></span>}
                {c.origem_nome&&<span>Origem: {c.origem_nome}</span>}
              </div>
            </div>
            <div className="com-client-meta">
              <span className={'com-pill '+(c.ativo?'good':'muted')}>{c.ativo?'Ativo':'Inativo'}</span>
              <small>Cadastro {dateBR(c.criado_em)}</small>
            </div>
            <div className="com-actions">
              <button type="button" onClick={()=>openClient(c)}>Editar</button>
              <button type="button" onClick={()=>openHistory(c)}>Corrente</button>
              <button type="button" className="primary" disabled={saving || !c.ativo}
                onClick={()=>navigate('atendimentos',c)}>Registrar chegada</button>
            </div>
          </article>)}
        </div>}
      {pages>1&&<div className="com-pagination">
        <button disabled={page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}>Anterior</button>
        <span>Página {page} de {pages}</span>
        <button disabled={page>=pages} onClick={()=>setPage(v=>Math.min(pages,v+1))}>Próxima</button>
      </div>}
    </section>
    {modal&&<SurfaceModal title={modal?.kind==='history'?'Histórico da corrente':modal==='new'?'Novo cliente':'Editar cliente'}
      subtitle={modal?.kind==='history'?modal.client.nome:'Dados do associado e responsável pela corrente.'}
      busy={saving} onClose={()=>setModal(null)}>
      {modal?.kind==='history'?<div className="cm-form">
        {history.length?history.map(item=><div className="com-history-row" key={item.id}>
          <strong>{item.dono_novo_nome}</strong>
          <small>{item.origem==='INDICACAO'?'Herdado por indicação':item.origem==='CADASTRO'?'Responsável inicial':'Alteração manual'} · {dateBR(item.criado_em,true)}</small>
          {item.dono_anterior_nome&&<p>Anterior: {item.dono_anterior_nome}</p>}
          {item.justificativa&&<p>Justificativa: {item.justificativa}</p>}
        </div>):<p className="com-disclaimer">Nenhuma alteração registrada.</p>}
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setModal(null)}>Fechar</button></div>
      </div>:<form className="cm-form" onSubmit={save}>
        <ClientFields key={modal==='new'?'new':modal.id} fields={fields} onChange={setFields}
          original={modal==='new'?null:modal} catalogs={catalogs}/>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" disabled={saving}
          onClick={()=>setModal(null)}>Cancelar</button><button type="submit" className="cm-button primary" disabled={saving}>
          {saving?'Salvando...':'Salvar cliente'}</button></div>
      </form>}
    </SurfaceModal>}
  </div>
}
