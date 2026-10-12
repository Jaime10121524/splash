import {useEffect,useState} from 'react'
import {comercialGet,comercialPost} from '../lib/comercialApi.js'
import './ComercialPages.css'

export default function MeuPerfil(){
 const [email,setEmail]=useState('')
 const [username,setUsername]=useState('')
 const [current,setCurrent]=useState('')
 const [newPassword,setNewPassword]=useState('')
 const [confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useEffect(()=>{
   comercialGet('/api/conta/perfil').then(r=>{
     setEmail(r.perfil?.email||'');setUsername(r.perfil?.username||'')
   }).catch(e=>setError(e.message))
 },[])
 async function save(e){
   e.preventDefault();setError('');setNotice('')
   if(newPassword!==confirm)return setError('A confirmação da nova senha não confere.')
   if(newPassword && (newPassword.length<8||!/[A-Z]/.test(newPassword)||!/[0-9]/.test(newPassword)))
     return setError('A senha precisa ter 8 caracteres, uma letra maiúscula e um número.')
   setBusy(true)
   try{
     const r=await comercialPost('/api/conta/perfil',{
       email:email.trim(),senha_atual:current,nova_senha:newPassword,
     })
     setNotice(r.message||'Alterações salvas.');setCurrent('');setNewPassword('');setConfirm('')
   }catch(err){setError(err.message)}
   finally{setBusy(false)}
 }
 return <div className="com-page">
  <header className="com-heading"><div><span className="com-eyebrow">SPLASH / CONTA</span><h1>Meu perfil</h1>
    <p>Atualize seu email e sua senha com segurança. Seu usuário de acesso permanece igual.</p></div></header>
  <section className="com-panel" style={{maxWidth:650,padding:'clamp(15px,3vw,28px)'}}>
   <form onSubmit={save} className="cm-form">
    <label>Nome de usuário<input value={username} disabled autoComplete="username"/></label>
    <label>E-mail de recuperação *<input type="email" value={email} required autoComplete="email" maxLength={254}
      onChange={e=>setEmail(e.target.value)}/></label>
    <div className="com-inform">Para alterar email ou senha, confirme sua senha atual. Se não pretende trocar a senha, deixe os dois campos da nova senha vazios.</div>
    <label>Senha atual *<input type="password" value={current} required autoComplete="current-password"
      onChange={e=>setCurrent(e.target.value)}/></label>
    <label>Nova senha<input type="password" value={newPassword} autoComplete="new-password"
      onChange={e=>setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres, maiúscula e número"/></label>
    <label>Confirme a nova senha<input type="password" value={confirm} autoComplete="new-password"
      onChange={e=>setConfirm(e.target.value)}/></label>
    {notice&&<p className="com-alert success" role="status">{notice}</p>}
    {error&&<p className="com-alert error" role="alert">{error}</p>}
    <div className="cm-form-actions"><button type="submit" disabled={busy} className="cm-button primary">
     {busy?'Salvando...':'Salvar meu perfil'}</button></div>
   </form>
  </section>
 </div>
}
