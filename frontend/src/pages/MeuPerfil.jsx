import {useEffect,useRef,useState} from 'react'
import {comercialGet,comercialPost,comercialUpload} from '../lib/comercialApi.js'
import {apiUrl} from '../lib/nativeApi.js'
import './ComercialPages.css'

export default function MeuPerfil(){
 const [email,setEmail]=useState('')
 const [username,setUsername]=useState('')
 const [current,setCurrent]=useState('')
 const [newPassword,setNewPassword]=useState('')
 const [confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false)
 const [photoBusy,setPhotoBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [imageFailed,setImageFailed]=useState(false)
 const [rev,setRev]=useState(0)
 const fileRef=useRef(null)

 useEffect(()=>{
   comercialGet('/api/conta/perfil').then(r=>{
     setEmail(r.perfil?.email||'');setUsername(r.perfil?.username||'')
   }).catch(e=>setError(e.message))
 },[])
 async function upload(e){
   const file=e.target.files?.[0]
   if(!file)return
   setError('');setNotice('')
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){
     setError('Selecione JPG, PNG ou WebP com até 2 MB.');e.target.value='';return
   }
   setPhotoBusy(true)
   try{
     await comercialUpload('/api/conta/foto',file)
     setRev(v=>v+1);setImageFailed(false)
     window.dispatchEvent(new Event('splash:avatar-updated'))
     setNotice('Foto de perfil atualizada!')
   }catch(err){setError(err.message)}
   finally{setPhotoBusy(false);e.target.value=''}
 }
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
    <p>Atualize sua foto, e-mail e senha com segurança.</p></div></header>
  <section className="com-panel" style={{maxWidth:650,padding:'clamp(15px,3vw,28px)'}}>
   <div style={{display:'flex',gap:18,alignItems:'center',marginBottom:25,flexWrap:'wrap'}}>
     <div style={{width:98,height:98,borderRadius:30,overflow:'hidden',background:'#F0EAFF',
       display:'grid',placeItems:'center',fontSize:36,fontWeight:900,color:'#624CDE'}}>
       {!imageFailed&&<img key={rev} src={apiUrl('/api/conta/foto')+'?rev='+rev} alt="Minha foto"
         style={{height:'100%',width:'100%',objectFit:'cover'}}
         onError={()=>setImageFailed(true)}/>}
       {imageFailed&&username.slice(0,1).toUpperCase()}
     </div>
     <div style={{display:'grid',gap:8}}>
       <strong style={{fontSize:18}}>{username}</strong>
       <button type="button" className="cm-button" disabled={photoBusy}
         onClick={()=>fileRef.current?.click()}>
         {photoBusy?'Enviando foto...':'Alterar foto de perfil'}
       </button>
       <small style={{color:'#817A92'}}>JPG, PNG ou WebP · até 2 MB</small>
     </div>
     <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
       onChange={upload} style={{display:'none'}} aria-label="Selecionar foto de perfil"/>
   </div>
   <form onSubmit={save} className="cm-form">
    <label>Nome de usuário<input value={username} disabled autoComplete="username"/></label>
    <label>E-mail de recuperação *<input type="email" value={email} required autoComplete="email" maxLength={254}
      onChange={e=>setEmail(e.target.value)}/></label>
    <div className="com-inform">Para alterar e-mail ou senha, confirme sua senha atual. Se não pretende trocar a senha, deixe os dois campos da nova senha vazios.</div>
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
