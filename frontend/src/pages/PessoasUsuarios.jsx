import { useCallback, useEffect, useMemo, useState } from 'react'
import { FormControl } from '../components/UiFields.jsx'
import './PessoasUsuarios.css'

const papelOptions = [
  { value:'corretor', label:'Corretor' },
  { value:'vendedor', label:'Vendedor' },
  { value:'gerente', label:'Gerente' },
]
const userRoles = papelOptions
const emptyPerson = () => ({nome:'',telefone:'',email:'',observacoes:'',papeis:['corretor'],ativo:true})
const emptyLogin = () => ({username:'',email:'',password:'',group:'corretor'})

async function request(url, options={}) {
  const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json',...(options.headers||{})},...options})
  const body=(response.headers.get('content-type')||'').includes('application/json')
    ? await response.json().catch(()=>({})) : {}
  if(!response.ok)throw new Error(body.message||('Erro HTTP '+response.status))
  return body
}
async function mutate(url,payload) {
  const session=await request('/api/session')
  if(!session.authenticated||!session.csrf)throw new Error('Sua sessão expirou. Faça login novamente.')
  return request(url,{method:'POST',headers:{'Content-Type':'application/json',[session.csrf.header]:session.csrf.hash},body:JSON.stringify(payload)})
}
function initials(name) {
  return String(name||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')
}
function roleLabel(role) {
  return ({admin:'Administrador',corretor:'Corretor',vendedor:'Vendedor',gerente:'Gerente',restrito:'Restrito'})[role]||role
}
function Status({active}) {
  return <span className={'pu-status '+(active?'active':'inactive')}>{active?'Ativo':'Inativo'}</span>
}
function Tag({value}) {return <span className="pu-role">{roleLabel(value)}</span>}
function Modal({children,title,eyebrow,onClose,busy}) {
  useEffect(()=>{
    function key(e){if(e.key==='Escape'&&!busy)onClose()}
    document.addEventListener('keydown',key)
    return ()=>document.removeEventListener('keydown',key)
  },[onClose,busy])
  return <div className="pu-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
    <section className="pu-dialog" role="dialog" aria-modal="true" aria-labelledby="pu-modal-title">
      <div className="pu-dialog-head"><div><span className="pu-eyebrow">{eyebrow||'SPLASH / ADMINISTRAÇÃO'}</span><h2 id="pu-modal-title">{title}</h2></div><button type="button" className="pu-close" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button></div>
      {children}
    </section>
  </div>
}

export default function PessoasUsuarios({tab='pessoas'}) {
  const [persons,setPersons]=useState([])
  const [accounts,setAccounts]=useState([])
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [search,setSearch]=useState('')
  const [statusFilter,setStatusFilter]=useState('todos')
  const [modal,setModal]=useState(null)
  const [personForm,setPersonForm]=useState(emptyPerson)
  const [loginForm,setLoginForm]=useState(emptyLogin)
  const [selectedAccount,setSelectedAccount]=useState('')
  const [selectedPerson,setSelectedPerson]=useState('')
  const [formError,setFormError]=useState('')

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      const [p,u]=await Promise.all([request('/api/pessoas'),request('/api/usuarios')])
      setPersons(p.pessoas||[])
      setAccounts(u.usuarios||[])
      setError('')
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{load()},[load])
  useEffect(()=>{setSearch('');setStatusFilter('todos');setNotice('')},[tab])

  const byUser=useMemo(()=>new Map(accounts.map(u=>[Number(u.id),u])),[accounts])
  const byPerson=useMemo(()=>new Map(persons.map(p=>[Number(p.id),p])),[persons])
  const unlinkedAccounts=useMemo(()=>accounts.filter(u=>!u.pessoa_id),[accounts])
  const availablePersons=useMemo(()=>persons.filter(p=>!p.user_id && p.ativo),[persons])
  const filteredPeople=persons.filter(p=>{
    const hay=(p.nome+' '+(p.telefone||'')+' '+(p.email||'')).toLocaleLowerCase('pt-BR')
    return hay.includes(search.toLocaleLowerCase('pt-BR')) &&
      (statusFilter==='todos'||(statusFilter==='ativos'?p.ativo:!p.ativo))
  })
  const filteredUsers=accounts.filter(u=>{
    const hay=(u.username+' '+(u.email||'')+' '+(u.pessoa_nome||'')).toLowerCase()
    return hay.includes(search.toLowerCase()) &&
      (statusFilter==='todos'||(statusFilter==='ativos'?u.ativo:!u.ativo))
  })
  const peopleCount=persons.length
  const usersCount=accounts.length
  const rolesCount=persons.reduce((n,p)=>n+(p.papeis||[]).length,0)

  function close(){if(!busy){setModal(null);setFormError('')}}
  function newPerson(person=null){
    setPersonForm(person?{
      nome:person.nome,telefone:person.telefone||'',email:person.email||'',
      observacoes:person.observacoes||'',papeis:[...person.papeis],ativo:!!person.ativo,
    }:emptyPerson())
    setFormError('')
    setModal({kind:'person',person})
  }
  function editLogin(user){
    setLoginForm({username:user.username,email:user.email||'',password:'',
      group:user.groups?.find(r=>r!=='restrito'&&r!=='admin')||'corretor'})
    setFormError('')
    setModal({kind:'editLogin',user})
  }
  function newLogin(person){
    setLoginForm({...emptyLogin(),email:person.email||'',group:person.papeis[0]||'corretor'})
    setFormError('')
    setModal({kind:'newLogin',person})
  }
  function linkLogin(person=null,user=null){
    setSelectedAccount('')
    setSelectedPerson('')
    setFormError('')
    setModal({kind:'link',person,user})
  }
  function changeState(user){
    setFormError('')
    setModal({kind:'state',user})
  }

  async function submitPerson(e){
    e.preventDefault()
    setFormError('')
    if(!personForm.nome.trim())return setFormError('Informe o nome da pessoa.')
    if(!personForm.papeis.length)return setFormError('Marque ao menos um papel.')
    setBusy(true)
    try{
      const url=modal.person?'/api/pessoas/'+modal.person.id+'/editar':'/api/pessoas'
      const result=await mutate(url,personForm)
      setNotice(result.message);setModal(null)
      await load()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function submitLogin(e){
    e.preventDefault()
    setFormError('')
    if(!modal.user && !loginForm.password)return setFormError('Informe uma senha inicial.')
    setBusy(true)
    try{
      const url=modal.kind==='newLogin'
        ? '/api/pessoas/'+modal.person.id+'/acesso'
        : '/api/usuarios/'+modal.user.id+'/editar'
      const result=await mutate(url,loginForm)
      setNotice(result.message);setModal(null)
      await load()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function submitLink(){
    setFormError('')
    const personId=modal.person?.id||Number(selectedPerson)
    const userId=modal.user?.id||Number(selectedAccount)
    if(!personId||!userId)return setFormError('Selecione uma pessoa e uma conta.')
    setBusy(true)
    try{
      const result=await mutate('/api/pessoas/'+personId+'/vincular',{user_id:userId})
      setNotice(result.message);setModal(null)
      await load()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function submitState(){
    setFormError('')
    setBusy(true)
    try{
      const result=await mutate('/api/usuarios/'+modal.user.id+'/situacao',{ativo:!modal.user.ativo})
      setNotice(result.message);setModal(null)
      await load()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  function toggleRole(role){
    setPersonForm(f=>({...f,papeis:f.papeis.includes(role)
      ? f.papeis.filter(r=>r!==role)
      : [...f.papeis,role]}))
  }

  return <div className="pu-page">
    <div className="pu-header">
      <div><span className="pu-eyebrow">SPLASH / SISTEMA</span>
        <h1>{tab==='pessoas'?'Pessoas':'Usuários'}</h1>
        <p>{tab==='pessoas'
          ?'Cadastre corretores, vendedores e gerentes, inclusive sem acesso ao aplicativo.'
          :'Gerencie os acessos ao SPLASH sem misturar as informações financeiras dos participantes.'}</p>
      </div>
      {tab==='pessoas'&&<button type="button" className="pu-primary" onClick={()=>newPerson()}>＋ Nova pessoa</button>}
    </div>
    {notice&&<div className="pu-notice ok" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    {error&&<div className="pu-notice err" role="alert">{error}<button onClick={load}>Tentar novamente</button></div>}
    <div className="pu-stats">
      <article><span>Pessoas cadastradas</span><strong>{peopleCount}</strong><small>Participantes do clube</small></article>
      <article><span>Contas com acesso</span><strong>{usersCount}</strong><small>Usuários cadastrados no Shield</small></article>
      <article><span>Funções atribuídas</span><strong>{rolesCount}</strong><small>Uma pessoa pode acumular papéis</small></article>
    </div>
    <section className="pu-panel">
      <div className="pu-panel-head"><div><h2>{tab==='pessoas'?'Participantes':'Acessos cadastrados'}</h2>
        <p>{tab==='pessoas'?'Selecione uma pessoa para editar dados ou gerenciar seu acesso.':'Somente o administrador pode criar, editar e bloquear contas.'}</p></div>
        <span className="pu-count">{tab==='pessoas'?filteredPeople.length:filteredUsers.length} encontrados</span></div>
      <div className="pu-filters">
        <input type="search" placeholder={tab==='pessoas'?'Buscar nome, telefone ou e-mail':'Buscar usuário, e-mail ou pessoa'}
          value={search} onChange={e=>setSearch(e.target.value)} aria-label="Pesquisar"/>
        <FormControl type="select" value={statusFilter} onChange={setStatusFilter} ariaLabel="Filtrar por situação"
          options={[{value:'todos',label:'Todas as situações'},{value:'ativos',label:'Ativos'},{value:'inativos',label:'Inativos'}]}/>
      </div>

      {loading?<div className="pu-empty">Carregando cadastros...</div>:
      tab==='pessoas'?
        filteredPeople.length===0?<div className="pu-empty"><span>♙</span><strong>Nenhuma pessoa encontrada</strong>
          <p>{persons.length?'Altere sua pesquisa.':'Cadastre o primeiro participante do clube.'}</p></div>:
        <div className="pu-list">
          {filteredPeople.map(p=>{
            const account=p.user_id?byUser.get(Number(p.user_id)):null
            return <article className="pu-entry" key={p.id}>
              <div className="pu-avatar">{initials(p.nome)}</div>
              <div className="pu-entry-main"><strong>{p.nome}</strong><small>{p.telefone||p.email||'Sem contato informado'}</small>
                <div className="pu-tags">{p.papeis.map(role=><Tag key={role} value={role}/>)}</div></div>
              <div className="pu-entry-status"><Status active={p.ativo}/><small>{account?'@'+account.username:'Sem acesso'}</small></div>
              <div className="pu-entry-actions">
                <button type="button" className="pu-secondary" onClick={()=>newPerson(p)}>Editar</button>
                {account ? <button type="button" className="pu-secondary" disabled={account.admin}
                  onClick={()=>editLogin(account)}>{account.admin?'Admin protegido':'Acesso'}</button>
                  : <><button type="button" className="pu-secondary" onClick={()=>newLogin(p)}>Criar acesso</button>
                  {unlinkedAccounts.length>0&&<button type="button" className="pu-secondary" onClick={()=>linkLogin(p)}>Vincular</button>}</>}
              </div>
            </article>
          })}
        </div>:
        filteredUsers.length===0?<div className="pu-empty"><span>♙</span><strong>Nenhum usuário encontrado</strong><p>Crie um acesso pelo cadastro da pessoa.</p></div>:
        <div className="pu-list">
          {filteredUsers.map(u=><article className="pu-entry" key={u.id}>
            <div className="pu-avatar">{initials(u.username)}</div>
            <div className="pu-entry-main"><strong>@{u.username}</strong>
              <small>{u.pessoa_nome||'Ainda sem pessoa vinculada'}</small>
              <small>{u.email||'Sem e-mail'}</small>
              <div className="pu-tags">{(u.groups||[]).map(role=><Tag key={role} value={role}/>)}</div>
            </div>
            <div className="pu-entry-status"><Status active={u.ativo}/></div>
            <div className="pu-entry-actions">
              {!u.pessoa_id&&availablePersons.length>0&&<button className="pu-secondary" onClick={()=>linkLogin(null,u)}>Vincular pessoa</button>}
              <button className="pu-secondary" disabled={u.admin} onClick={()=>editLogin(u)}>{u.admin?'Admin protegido':'Editar acesso'}</button>
              {!u.admin&&<button className={'pu-secondary '+(u.ativo?'pu-warning':'')} onClick={()=>changeState(u)}>{u.ativo?'Bloquear':'Reativar'}</button>}
            </div>
          </article>)}
        </div>}
    </section>

    {modal&&<Modal title={
      modal.kind==='person'?(modal.person?'Editar pessoa':'Nova pessoa'):
      modal.kind==='newLogin'?'Criar acesso':
      modal.kind==='editLogin'?'Editar acesso':
      modal.kind==='link'?'Vincular conta':'Confirmar alteração'
    } busy={busy} onClose={close}>
      {modal.kind==='person'&&<form className="pu-form" onSubmit={submitPerson}>
        <p className="pu-intro">Uma mesma pessoa pode atuar como corretor, vendedor e gerente.</p>
        <label>Nome completo <em>*</em><input autoFocus required maxLength={160} value={personForm.nome}
          onChange={e=>setPersonForm(f=>({...f,nome:e.target.value}))} placeholder="Nome do participante"/></label>
        <div className="pu-form-grid">
          <label>Telefone<input type="tel" maxLength={25} value={personForm.telefone}
            onChange={e=>setPersonForm(f=>({...f,telefone:e.target.value}))} placeholder="(00) 00000-0000"/></label>
          <label>E-mail<input type="email" maxLength={254} value={personForm.email}
            onChange={e=>setPersonForm(f=>({...f,email:e.target.value}))} placeholder="nome@exemplo.com"/></label>
        </div>
        <div className="pu-form-label">Funções <em>*</em></div>
        <div className="pu-role-choices">{papelOptions.map(role=><label key={role.value}><input type="checkbox"
          checked={personForm.papeis.includes(role.value)} onChange={()=>toggleRole(role.value)}/>{role.label}</label>)}</div>
        <label>Observações<textarea rows="3" maxLength={3000} value={personForm.observacoes}
          onChange={e=>setPersonForm(f=>({...f,observacoes:e.target.value}))} placeholder="Informações adicionais (opcional)"/></label>
        <label className="pu-switch"><span><strong>Ativo</strong><small>Inativar uma pessoa também bloqueia seu acesso, se houver.</small></span>
          <input type="checkbox" checked={personForm.ativo} onChange={e=>setPersonForm(f=>({...f,ativo:e.target.checked}))}/></label>
        {formError&&<p className="pu-validation" role="alert">{formError}</p>}
        <div className="pu-dialog-actions"><button type="button" className="pu-secondary" disabled={busy} onClick={close}>Cancelar</button>
          <button className="pu-primary" type="submit" disabled={busy}>{busy?'Salvando...':'Salvar pessoa'}</button></div>
      </form>}
      {(modal.kind==='newLogin'||modal.kind==='editLogin')&&<form className="pu-form" onSubmit={submitLogin}>
        <p className="pu-intro">{modal.kind==='newLogin'
          ? 'Crie um acesso individual para '+modal.person.nome+'. A senha deve ser informada com segurança diretamente ao usuário.'
          : 'Atualize o login sem modificar registros e comissões da pessoa vinculada.'}</p>
        <label>Nome de usuário <em>*</em><input autoFocus required minLength={3} maxLength={50} value={loginForm.username}
          onChange={e=>setLoginForm(f=>({...f,username:e.target.value}))} placeholder="Ex.: vendedor01"/></label>
        <label>E-mail de recuperação <em>*</em><input type="email" required maxLength={254} value={loginForm.email}
          onChange={e=>setLoginForm(f=>({...f,email:e.target.value}))} placeholder="nome@exemplo.com"/></label>
        <label>{modal.kind==='newLogin'?'Senha inicial':'Nova senha (opcional)'} {modal.kind==='newLogin'&&<em>*</em>}
          <input type="password" autoComplete="new-password" minLength={modal.kind==='newLogin'?8:undefined}
            required={modal.kind==='newLogin'} value={loginForm.password}
            onChange={e=>setLoginForm(f=>({...f,password:e.target.value}))}
            placeholder={modal.kind==='newLogin'?'Crie uma senha forte':'Deixe vazio para manter a senha atual'}/>
          <small>Mínimo 8 caracteres, uma letra maiúscula e um número.</small></label>
        <label>Grupo de acesso <em>*</em><FormControl type="select" value={loginForm.group}
          onChange={next=>setLoginForm(f=>({...f,group:next}))} ariaLabel="Grupo de acesso"
          options={modal.kind==='newLogin'?papelOptions.filter(r=>modal.person.papeis.includes(r.value))
            :userRoles.filter(r=>byPerson.get(modal.user.pessoa_id)?.papeis?.includes(r.value))}/></label>
        <div className="pu-hint">O grupo define quais telas aparecem. As futuras APIs financeiras também validarão o titular dos dados, independentemente do menu.</div>
        {formError&&<p className="pu-validation" role="alert">{formError}</p>}
        <div className="pu-dialog-actions"><button className="pu-secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="pu-primary" type="submit" disabled={busy}>{busy?'Salvando...':'Salvar acesso'}</button></div>
      </form>}
      {modal.kind==='link'&&<div className="pu-form">
        <p className="pu-intro">Vincule uma conta do Shield a uma pessoa cadastrada sem login. Esse vínculo é único.</p>
        {modal.person?<label>Pessoa<strong>{modal.person.nome}</strong></label>
          :<label>Pessoa <em>*</em><FormControl type="select" value={selectedPerson} onChange={setSelectedPerson}
            placeholder="Selecione a pessoa" options={availablePersons.map(p=>({value:String(p.id),label:p.nome}))}/></label>}
        {modal.user?<label>Usuário<strong>@{modal.user.username}</strong></label>
          :<label>Conta existente <em>*</em><FormControl type="select" value={selectedAccount} onChange={setSelectedAccount}
            placeholder="Selecione o usuário" options={unlinkedAccounts.map(u=>({value:String(u.id),label:'@'+u.username+' · '+roleLabel(u.groups?.[0]||'restrito')}))}/></label>}
        {formError&&<p className="pu-validation" role="alert">{formError}</p>}
        <div className="pu-dialog-actions"><button className="pu-secondary" type="button" onClick={close}>Cancelar</button><button className="pu-primary" disabled={busy} onClick={submitLink}>{busy?'Vinculando...':'Vincular conta'}</button></div>
      </div>}
      {modal.kind==='state'&&<div className="pu-form"><p className="pu-intro">Deseja {modal.user.ativo?'bloquear':'reativar'} o acesso de <strong>@{modal.user.username}</strong>? {modal.user.ativo?'O usuário não poderá entrar enquanto estiver bloqueado.':'O acesso voltará a funcionar se a pessoa vinculada também estiver ativa.'}</p>
        {formError&&<p className="pu-validation" role="alert">{formError}</p>}
        <div className="pu-dialog-actions"><button type="button" className="pu-secondary" onClick={close} disabled={busy}>Cancelar</button><button type="button" className="pu-primary" onClick={submitState} disabled={busy}>{busy?'Processando...':'Confirmar'}</button></div></div>}
    </Modal>}
  </div>
}
