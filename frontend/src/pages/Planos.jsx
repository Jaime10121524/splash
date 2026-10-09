import { useEffect, useState } from 'react'
import './Planos.css'
import { FormControl } from '../components/UiFields.jsx'

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
    const recent=parent?.versoes?.find(v=>v.ativo)||parent?.versoes?.[0]
    const months=recent?Number(recent.duracao_meses):0
    setForm({...blank(),codigo:recent?.codigo||'',
      valor:recent?.valor ? Number(recent.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '',
      duracao:months?String(months%12===0?months/12:months):'',
      unidade:months===0||months%12===0?'anos':'meses',
      ativo:true,vigencia_inicio:''})
    setValidation('')
    setModal({type:'form',parent})
  }
  function openEdit(parent,version) {
    const months=Number(version.duracao_meses)
    setForm({
      codigo:version.codigo,
      valor:Number(version.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),
      duracao:String(months%12===0?months/12:months),
      unidade:months%12===0?'anos':'meses',
      ativo:!!version.ativo,
      vigencia_inicio:version.vigencia_inicio?.slice(0,10)||''
    })
    setValidation('')
    setModal({type:'edit',parent,version})
  }
  function openStatus(parent,version) {setValidation('');setModal({type:'status',parent,version})}
  function openDelete(parent) {setValidation('');setModal({type:'delete',parent})}
  function closeModal(){if(!busy)setModal(null)}
  function toggle(id){setExpanded(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])}

  async function save(e) {
    e.preventDefault()
    setValidation('')
    const valor=normalizarValor(form.valor)
    const meses=Number(form.duracao)*(form.unidade==='anos'?12:1)
    const sigla=form.codigo.trim().replace(/\s*\/\s*/g,'/').toUpperCase()
    if(!/^\p{L}{1,8}\/\p{L}{1,8}$/u.test(sigla))
      return setValidation('Informe apenas as letras do plano, como P/T ou R/T. A numeração pertence a cada venda.')
    if(!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(valor)||Number(valor)<=0)
      return setValidation('Informe um valor positivo com até duas casas decimais.')
    if(!Number.isSafeInteger(meses)||meses<1||meses>2400)
      return setValidation('Informe uma duração de 1 a 2400 meses.')
    setBusy(true)
    try {
      const {parent,version,type}=modal
      const url=type==='edit'
        ? '/api/planos/'+parent.id+'/versoes/'+version.id+'/editar'
        : parent ? '/api/planos/'+parent.id+'/versoes' : '/api/planos'
      const response=await enviar(url,{codigo:sigla,valor,duracao_meses:meses,ativo:form.ativo,vigencia_inicio:form.vigencia_inicio||null})
      setModal(null)
      setNotice(response.message)
      await load()
      if(parent)setExpanded(prev=>[...new Set([...prev,parent.id])])
    }catch(e){setValidation(e.message)}
    finally{setBusy(false)}
  }
  async function confirmAction() {
    setBusy(true)
    setValidation('')
    try {
      const {parent,version,type}=modal
      const response=type==='delete'
        ? await enviar('/api/planos/'+parent.id+'/excluir',{})
        : await enviar('/api/planos/'+parent.id+'/versoes/'+version.id+'/status',{ativo:!version.ativo})
      setModal(null);setNotice(response.message)
      await load()
    }catch(e){setValidation(e.message)}
    finally{setBusy(false)}
  }

  const filtered=list.filter(p=>{
    const versions=p.versoes||[]
    const term=search.trim().toLowerCase()
    const found=!term||versions.some(v=>v.codigo.toLowerCase().includes(term))
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
      <div className="planos-panel-header"><div><h2>Lista de planos</h2><p>Siglas e preços atuais e anteriores.</p></div><span className="planos-count">{filtered.length} encontrados</span></div>
      <div className="planos-toolbar"><input type="search" aria-label="Pesquisar planos" placeholder="Pesquisar por sigla (P/T, R/T)..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <FormControl type="select" ariaLabel="Filtrar por situação" value={filter} onChange={setFilter}
          options={[{value:'todos',label:'Todas as situações'},{value:'ativos',label:'Ativos'},{value:'inativos',label:'Inativos'}]}/>
      </div>
      {loading?<div className="planos-empty">Carregando planos...</div>:filtered.length===0?<div className="planos-empty"><span className="planos-empty-icon">▣</span><strong>{list.length===0?'Nenhum plano cadastrado':'Nenhum plano encontrado'}</strong><p>{list.length===0?'Cadastre o primeiro plano para começar.':'Experimente outros filtros.'}</p></div>:
      <div className="planos-list">{filtered.map(p=>{
        const versions=p.versoes||[]
        const active=versions.some(v=>v.ativo)
        const current=versions.find(v=>v.ativo)||versions[0]
        const isOpen=expanded.includes(p.id)
        return <article className="planos-item" key={p.id}>
          <div className="planos-item-top">
            <button className="planos-identity" type="button" onClick={()=>toggle(p.id)} aria-expanded={isOpen}><span className="planos-monogram">P</span><span><strong>{current?.codigo}</strong><small>{prazo(current?.duracao_meses)} · {versions.length} versão(ões)</small></span></button>
            <div className="planos-item-info"><strong>{moeda(current?.valor)}</strong><small>{prazo(current?.duracao_meses)}</small></div>
            <span className={'planos-tag '+(active?'active':'inactive')}>{active?'Ativo':'Inativo'}</span>
            <div className="planos-actions">
                <button type="button" className="planos-outline" onClick={()=>openEdit(p,current)}>Editar</button>
                <button type="button" className="planos-outline" onClick={()=>openForm(p)}>Reajustar</button>
                <button type="button" className="planos-outline planos-danger" onClick={()=>openDelete(p)}>Excluir</button>
                <button type="button" className="planos-round" aria-label={isOpen?'Ocultar versões':'Mostrar versões'} aria-expanded={isOpen} onClick={()=>toggle(p.id)}>{isOpen?'⌃':'⌄'}</button>
              </div>
          </div>
          {isOpen&&<div className="planos-history"><h3>HISTÓRICO DE VERSÕES</h3>{versions.map(v=><div className="planos-version" key={v.id}>
            <div><strong>{v.codigo}</strong><small>Versão {v.versao}{v.vigencia_inicio?' · Vigência: '+v.vigencia_inicio.substring(0,10).split('-').reverse().join('/') : ''}</small></div>
            <div className="planos-version-price"><strong>{moeda(v.valor)}</strong><small>{prazo(v.duracao_meses)}</small></div>
            <span className={'planos-tag '+(v.ativo?'active':'inactive')}>{v.ativo?'Ativa':'Histórica / Inativa'}</span>
            <div className="planos-history-actions">
              <button type="button" className="planos-link" onClick={()=>openEdit(p,v)}>Editar</button>
              <button type="button" className="planos-link" onClick={()=>openStatus(p,v)}>{v.ativo?'Inativar':'Ativar'}</button>
            </div>
          </div>)}<p className="planos-history-note">Use Editar para corrigir um cadastro ainda não usado em vendas. Para reajustar, crie outra versão e preserve o histórico.</p></div>}
        </article>
      })}</div>}
    </div>
    {modal&&<div className="planos-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}>
      <div className="planos-modal" role="dialog" aria-modal="true" aria-labelledby="planos-modal-title">
        <div className="planos-modal-header">
          <div><span className="planos-eyebrow">{modal.type==='form'||modal.type==='edit'?'CADASTRO DE PLANOS':'CONFIRMAÇÃO'}</span>
            <h2 id="planos-modal-title">{modal.type==='edit'?'Editar plano':modal.type==='form'?(modal.parent?'Novo reajuste':'Novo plano'):modal.type==='delete'?'Excluir plano':modal.version.ativo?'Inativar versão':'Ativar versão'}</h2>
          </div>
          <button type="button" className="planos-round" onClick={closeModal} disabled={busy} aria-label="Fechar">×</button>
        </div>
        {(modal.type==='form'||modal.type==='edit')?
          <form className="planos-form" onSubmit={save}>
            <p className="planos-intro">{modal.type==='edit'
              ? 'Corrija as informações desta versão. Se ela já estiver vinculada a uma venda, será necessário criar um reajuste.'
              : modal.parent
              ? 'Os dados foram preenchidos com a versão atual. Altere somente o que mudou; a versão anterior será preservada.'
              : 'Cadastre a sigla, o preço e o prazo do plano. A numeração será individual para cada venda.'}</p>
            <label><span className="planos-field-title">Sigla do plano <em>*</em></span>
              <input autoFocus type="text" maxLength={17} placeholder="Ex.: P/T ou R/T" required
                value={form.codigo} onChange={e=>setForm(f=>({...f,codigo:e.target.value.toUpperCase()}))}/>
              <small>Somente as letras. Ex.: P/T. Os quatro números são do título vendido.</small>
            </label>
            <label><span className="planos-field-title">Valor do plano (R$) <em>*</em></span>
              <input type="text" inputMode="decimal" placeholder="Ex.: 1.000,00" required
                value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))}/>
            </label>
            <div className="planos-form-row">
              <label><span className="planos-field-title">Duração <em>*</em></span>
                <input type="number" min="1" step="1" required value={form.duracao}
                  placeholder="Ex.: 5" onChange={e=>setForm(f=>({...f,duracao:e.target.value}))}/>
              </label>
              <label><span className="planos-field-title">Unidade</span>
                <FormControl type="select" ariaLabel="Unidade da duração" value={form.unidade}
                  onChange={next=>setForm(f=>({...f,unidade:next}))}
                  options={[{value:'anos',label:'Anos'},{value:'meses',label:'Meses'}]}/>
              </label>
            </div>
            <label><span className="planos-field-title">Início de vigência <small>(opcional)</small></span>
              <FormControl type="date" ariaLabel="Início de vigência" value={form.vigencia_inicio}
                onChange={next=>setForm(f=>({...f,vigencia_inicio:next}))}/>
            </label>
            <label className="planos-check"><span><strong>Versão ativa</strong><small>Disponível para novas vendas</small></span>
              <input type="checkbox" checked={form.ativo} onChange={e=>setForm(f=>({...f,ativo:e.target.checked}))}/>
            </label>
            {validation&&<p className="planos-validation" role="alert">{validation}</p>}
            <div className="planos-modal-actions">
              <button type="button" className="planos-secondary" onClick={closeModal} disabled={busy}>Cancelar</button>
              <button type="submit" className="planos-primary" disabled={busy}>{busy?'Salvando...':'Salvar'}</button>
            </div>
          </form>:
          <div className="planos-form">
            <p className="planos-intro">
              {modal.type==='delete'
                ? <>Deseja excluir o plano <strong>{modal.parent?.versoes?.[0]?.codigo}</strong> e todas as suas versões? Essa operação não poderá ser desfeita. Se houver vendas vinculadas, a exclusão será bloqueada.</>
                : <>Confirma {modal.version.ativo?'a inativação':'a ativação'} da versão <strong>{modal.version.codigo}</strong>? {modal.version.ativo
                    ? 'Ela não ficará disponível para novas vendas.'
                    : 'Outras versões ativas desse mesmo plano serão inativadas.'}</>}
            </p>
            {validation&&<p className="planos-validation" role="alert">{validation}</p>}
            <div className="planos-modal-actions">
              <button type="button" className="planos-secondary" onClick={closeModal} disabled={busy}>Cancelar</button>
              <button type="button" className={'planos-primary'+(modal.type==='delete'?' planos-delete-confirm':'')} onClick={confirmAction} disabled={busy}>
                {busy?'Processando...':modal.type==='delete'?'Sim, excluir':'Confirmar'}
              </button>
            </div>
          </div>}
      </div>
    </div>}
  </section>
}
