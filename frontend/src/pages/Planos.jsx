import { useEffect, useState } from 'react'
import './Planos.css'

const moeda = n => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(n))
const prazo = n => Number(n)%12===0 ? (Number(n)/12)+' ano(s)' : n+' mês(es)'
const blank = () => ({ codigo:'',valor:'',duracao:'',unidade:'anos',ativo:true,vigencia_inicio:'' })
function normalizarValor(s) {
  s=String(s).replace(/[R$\s]/g,'')
  if(s.includes(',')) return s.replace(/\./g,'').replace(',','.')
  if(/^\d{1,3}(\.\d{3})+$/.test(s)) return s.replace(/\./g,'')
  return s
}
async function api(url, options={}) {
  const res=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json',...(options.headers||{})},...options})
  const type=res.headers.get('content-type')||''
  const data=type.includes('application/json')?await res.json().catch(()=>({})):{}
  if(!res.ok) throw new Error(data.message||('Erro HTTP '+res.status))
  return data
}
async function enviar(url, data) {
  const session=await api('/api/session')
  if(!session.authenticated || !session.csrf) throw new Error('Sessão expirada. Entre novamente.')
  return api(url,{method:'POST',headers:{'Content-Type':'application/json',[session.csrf.header]:session.csrf.hash},body:JSON.stringify(data)})
}
export default function Planos() {
  const [list,setList]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState('todos')
  const [expanded,setExpanded]=useState([])
  const [modal,setModal]=useState(null)
  const [form,setForm]=useState(blank)
  const [validation,setValidation]=useState('')
  const [busy,setBusy]=useState(false)

  async function load() {
    setLoading(true)
    try {
      const response=await api('/api/planos')
      setList(response.planos||[])
      setError('')
    } catch(e) {setError(e.message)}
    finally {setLoading(false)}
  }
  useEffect(()=>{load()},[])
  useEffect(()=>{
    if(!modal) return undefined
    const esc=e=>{if(e.key==='Escape'&&!busy)setModal(null)}
    document.addEventListener('keydown',esc)
    return ()=>document.removeEventListener('keydown',esc)
  },[modal,busy])

  function openForm(parent=null) {
    const recent=parent&&parent.versoes?parent.versoes[0]:null
    const months=recent?Number(recent.duracao_meses):0
    setForm({...blank(),duracao:months?String(months%12===0?months/12:months):'',unidade:months%12===0?'anos':'meses'})
    setValidation('')
    setModal({type:'form',parent})
  }
  function openStatus(parent,version) {setValidation('');setModal({type:'status',parent,version})}
  function closeModal(){if(!busy)setModal(null)}
  function toggle(id){setExpanded(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])}

  async function save(e) {
    e.preventDefault()
    setValidation('')
    const valor=normalizarValor(form.valor)
    const meses=Number(form.duracao)*(form.unidade==='anos'?12:1)
    if(!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(valor)||Number(valor)<=0) return setValidation('Informe um valor positivo com até duas casas decimais.')
    if(!Number.isSafeInteger(meses)||meses<1||meses>2400)return setValidation('Informe duração de 1 a 2400 meses.')
    setBusy(true)
    try {
      const parent=modal.parent
      const url=parent?'/api/planos/'+parent.id+'/versoes':'/api/planos'
      const response=await enviar(url,{codigo:form.codigo.trim(),valor,duracao_meses:meses,ativo:form.ativo,vigencia_inicio:form.vigencia_inicio||null})
      setModal(null)
      setNotice(response.message)
      await load()
      if(parent)setExpanded(prev=>[...new Set([...prev,parent.id])])
    } catch(e){setValidation(e.message)}
    finally{setBusy(false)}
  }
  async function saveStatus() {
    setBusy(true);setValidation('')
    try {
      const {parent,version}=modal
      const response=await enviar('/api/planos/'+parent.id+'/versoes/'+version.id+'/status',{ativo:!version.ativo})
      setModal(null);setNotice(response.message);await load()
    }catch(e){setValidation(e.message)}
    finally{setBusy(false)}
  }

  const filtered=list.filter(p=>{
    const versions=p.versoes||[]
    const term=search.trim().toLowerCase()
    const found=!term||String(p.id).includes(term)||versions.some(v=>v.codigo.toLowerCase().includes(term))
    const active=versions.some(v=>v.ativo)
    return found&&(filter==='todos'||(filter==='ativos'&&active)||(filter==='inativos'&&!active))
  })
  const activeCount=list.filter(p=>(p.versoes||[]).some(v=>v.ativo)).length
  const versionCount=list.reduce((sum,p)=>sum+(p.versoes||[]).length,0)
  return <section className="planos-page">
    <header className="planos-header"><div><span className="planos-eyebrow">CADASTROS / COMERCIAL</span><h1>Planos</h1><p>Gerencie os títulos do clube e preserve o histórico de reajustes.</p></div><button className="planos-primary" type="button" onClick={()=>openForm()}>＋ Novo plano</button></header>
    {notice&&<div className="planos-message success" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Fechar aviso">×</button></div>}
    {error&&<div className="planos-message error" role="alert">{error}<button onClick={load}>Tentar novamente</button></div>}
    <div className="planos-stats"><article><span>Planos cadastrados</span><strong>{list.length}</strong><small>Cadastros principais</small></article><article><span>Planos ativos</span><strong>{activeCount}</strong><small>Disponíveis para venda</small></article><article><span>Versões cadastradas</span><strong>{versionCount}</strong><small>Histórico preservado</small></article></div>
    <div className="planos-panel">
      <div className="planos-panel-header"><div><h2>Lista de planos</h2><p>Códigos atuais e versões anteriores.</p></div><span className="planos-count">{filtered.length} encontrados</span></div>
      <div className="planos-toolbar"><input type="search" aria-label="Pesquisar planos" placeholder="Pesquisar por código..." value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filtrar por situação" value={filter} onChange={e=>setFilter(e.target.value)}><option value="todos">Todas as situações</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option></select></div>
      {loading?<div className="planos-empty">Carregando planos...</div>:filtered.length===0?<div className="planos-empty"><span className="planos-empty-icon">▣</span><strong>{list.length===0?'Nenhum plano cadastrado':'Nenhum plano encontrado'}</strong><p>{list.length===0?'Cadastre o primeiro plano para começar.':'Experimente outros filtros.'}</p></div>:
      <div className="planos-list">{filtered.map(p=>{
        const versions=p.versoes||[]
        const active=versions.some(v=>v.ativo)
        const current=versions.find(v=>v.ativo)||versions[0]
        const isOpen=expanded.includes(p.id)
        return <article className="planos-item" key={p.id}>
          <div className="planos-item-top">
            <button className="planos-identity" type="button" onClick={()=>toggle(p.id)} aria-expanded={isOpen}><span className="planos-monogram">P</span><span><strong>{current?.codigo}</strong><small>Plano #{p.id} · {versions.length} versão(ões)</small></span></button>
            <div className="planos-item-info"><strong>{moeda(current?.valor)}</strong><small>{prazo(current?.duracao_meses)}</small></div>
            <span className={'planos-tag '+(active?'active':'inactive')}>{active?'Ativo':'Inativo'}</span>
            <div className="planos-actions"><button type="button" className="planos-outline" onClick={()=>openForm(p)}>Novo reajuste</button><button className="planos-round" aria-label={isOpen?'Ocultar versões':'Mostrar versões'} aria-expanded={isOpen} onClick={()=>toggle(p.id)}>{isOpen?'⌃':'⌄'}</button></div>
          </div>
          {isOpen&&<div className="planos-history"><h3>HISTÓRICO DE VERSÕES</h3>{versions.map(v=><div className="planos-version" key={v.id}>
            <div><strong>{v.codigo}</strong><small>Versão {v.versao}{v.vigencia_inicio?' · Vigência: '+v.vigencia_inicio.substring(0,10).split('-').reverse().join('/') : ''}</small></div>
            <div className="planos-version-price"><strong>{moeda(v.valor)}</strong><small>{prazo(v.duracao_meses)}</small></div>
            <span className={'planos-tag '+(v.ativo?'active':'inactive')}>{v.ativo?'Ativa':'Histórica / Inativa'}</span>
            <button type="button" className="planos-link" onClick={()=>openStatus(p,v)}>{v.ativo?'Inativar':'Ativar'}</button>
          </div>)}<p className="planos-history-note">Para alterar código, duração ou preço, cadastre uma nova versão. Os dados anteriores não são apagados.</p></div>}
        </article>
      })}</div>}
    </div>
    {modal&&<div className="planos-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><div className="planos-modal" role="dialog" aria-modal="true" aria-labelledby="planos-modal-title">
      <div className="planos-modal-header"><div><span className="planos-eyebrow">{modal.type==='form'?'CADASTRO DE PLANOS':'CONFIRMAÇÃO'}</span><h2 id="planos-modal-title">{modal.type==='form'?(modal.parent?'Novo reajuste':'Novo plano'):(modal.version.ativo?'Inativar versão':'Ativar versão')}</h2></div><button type="button" className="planos-round" onClick={closeModal} disabled={busy} aria-label="Fechar">×</button></div>
      {modal.type==='form'?<form className="planos-form" onSubmit={save}>
        <p className="planos-intro">{modal.parent?'Criar uma versão preservará as condições anteriores. Se estiver ativa, ela substituirá a versão atual.':'Informe as condições comerciais iniciais do plano.'}</p>
        <label>Código <span>*</span><input autoFocus type="text" maxLength={40} placeholder="Ex.: 1567 R/T" required value={form.codigo} onChange={e=>setForm(f=>({...f,codigo:e.target.value}))}/></label>
        <label>Valor do plano (R$) <span>*</span><input type="text" inputMode="decimal" placeholder="Ex.: 1.000,00" required value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))}/></label>
        <div className="planos-form-row"><label>Duração <span>*</span><input type="number" min="1" step="1" required value={form.duracao} placeholder="Ex.: 5" onChange={e=>setForm(f=>({...f,duracao:e.target.value}))}/></label><label>Unidade<select value={form.unidade} onChange={e=>setForm(f=>({...f,unidade:e.target.value}))}><option value="anos">Anos</option><option value="meses">Meses</option></select></label></div>
        <label>Início de vigência <small>(opcional)</small><input type="date" value={form.vigencia_inicio} onChange={e=>setForm(f=>({...f,vigencia_inicio:e.target.value}))}/></label>
        <label className="planos-check"><span><strong>Versão ativa</strong><small>Disponível para novas vendas</small></span><input type="checkbox" checked={form.ativo} onChange={e=>setForm(f=>({...f,ativo:e.target.checked}))}/></label>
        {validation&&<p className="planos-validation" role="alert">{validation}</p>}
        <div className="planos-modal-actions"><button type="button" className="planos-secondary" onClick={closeModal} disabled={busy}>Cancelar</button><button type="submit" className="planos-primary" disabled={busy}>{busy?'Salvando...':'Salvar plano'}</button></div>
      </form>:<div className="planos-form"><p className="planos-intro">Deseja {modal.version.ativo?'inativar':'ativar'} a versão <strong>{modal.version.codigo}</strong>? {modal.version.ativo?'Ela deixará de estar disponível para novas vendas.':'A versão ativa atual desse plano será inativada. O histórico permanece intacto.'}</p>{validation&&<p className="planos-validation" role="alert">{validation}</p>}<div className="planos-modal-actions"><button className="planos-secondary" onClick={closeModal} disabled={busy}>Cancelar</button><button className="planos-primary" onClick={saveStatus} disabled={busy}>{busy?'Salvando...':'Confirmar'}</button></div></div>}
    </div></div>}
  </section>
}
