import {PushNotifications} from '@capacitor/push-notifications'
import {isNative} from '../lib/nativeApi.js'
import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR} from '../lib/comercialApi.js'
import './NotificacoesSplash.css'

function decodeKey(encoded){
 const padding='='.repeat((4-encoded.length%4)%4)
 const raw=atob((encoded+padding).replace(/-/g,'+').replace(/_/g,'/'))
 return Uint8Array.from(raw,ch=>ch.charCodeAt(0))
}
export async function stopCurrentPush(){
 if(isNative()){
   const token=localStorage.getItem('splash_android_push_token')
   if(token){
     try{await comercialPost('/api/notificacoes/nativo/remover',{token})}catch{}
     localStorage.removeItem('splash_android_push_token')
   }
   return
 }
 if(!('serviceWorker' in navigator))return
 try{
  const reg=await navigator.serviceWorker.getRegistration('/')
  const sub=await reg?.pushManager?.getSubscription()
  if(!sub)return
  try{await comercialPost('/api/notificacoes/dispositivos/remover',{endpoint:sub.endpoint})}catch{}
  await sub.unsubscribe()
 }catch{}
}
export default function NotificacoesSplash({navigate}){
 const [data,setData]=useState({avisos:[],nao_lidas:0,push_disponivel:false,vapid_publica:''})
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 async function refresh(){
  try{setData(await comercialGet('/api/notificacoes'));setError('')}
  catch(e){setError(e.message)}
 }
 useEffect(()=>{
  refresh()
  const id=setInterval(refresh,90000)
  return ()=>clearInterval(id)
 },[])
 async function enableNative(){
  setError('');setNotice('')
  if(!data.push_nativo_disponivel){
   setNotice('O aplicativo foi preparado, mas o administrador ainda precisa configurar o projeto Firebase no servidor para entregar notificações ao Android.')
   return
  }
  setBusy(true)
  try{
   const permission=await PushNotifications.requestPermissions()
   if(permission.receive!=='granted')throw new Error('Permissão de notificações negada no Android.')
   await PushNotifications.removeAllListeners()
   await PushNotifications.addListener('registration',async result=>{
    try{
     await comercialPost('/api/notificacoes/nativo',{token:result.value,plataforma:'android'})
     localStorage.setItem('splash_android_push_token',result.value)
     setNotice('Notificações Android ativadas para sua conta.')
    }catch(e){setError(e.message)}
   })
   await PushNotifications.addListener('registrationError',err=>setError(err.error||'Falha no cadastro FCM.'))
   await PushNotifications.addListener('pushNotificationReceived',()=>refresh())
   await PushNotifications.addListener('pushNotificationActionPerformed',event=>{
    const route=event.notification?.data?.route
    if(['vendas','atendimentos','titulos','pendencias','relatorios'].includes(route))navigate(route)
    refresh()
   })
   await PushNotifications.register()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 async function enable(){
  setError('');setNotice('')
  if(!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)
    || !('PushManager' in window)){
    setError('Este navegador não oferece Web Push neste contexto. Use HTTPS e instale o app quando necessário.')
    return
  }
  if(!data.push_disponivel){
    setNotice('O envio de avisos ao celular ainda não foi ativado na hospedagem. Os avisos neste painel continuam funcionando normalmente.')
    return
  }
  // Solicite permissão diretamente após o clique, exigido em celulares.
  const permitted=await Notification.requestPermission()
  if(permitted!=='granted'){setError('Notificações não foram autorizadas neste aparelho.');return}
  setBusy(true)
  try{
    const reg=await navigator.serviceWorker.register('/push-sw.js',{scope:'/'})
    await navigator.serviceWorker.ready
    let sub=await reg.pushManager.getSubscription()
    if(!sub)sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:decodeKey(data.vapid_publica),
    })
    await comercialPost('/api/notificacoes/dispositivos',{assinatura:sub.toJSON()})
    setNotice('Celular vinculado. Você receberá notificações do SPLASH, inclusive com o aplicativo fechado, conforme as regras do sistema operacional.')
    refresh()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 async function open(item){
  if(!item.lido_em){
    try{await comercialPost('/api/notificacoes/'+item.id+'/ler',{});refresh()}catch{}
  }
  if(item.rota)navigate(item.rota)
 }
 return <div className="sn-panel">
  <div className="sn-header"><div><strong>Notificações</strong>
    <small>{data.nao_lidas} não lida(s)</small></div>
    <button onClick={refresh} type="button" aria-label="Atualizar avisos">Atualizar</button></div>
  {isNative()
   ?<button type="button" className="sn-enable" onClick={enableNative} disabled={busy}>
     {busy?'Configurando Android...':'Ativar notificações Android'}
    </button>
   :data.push_disponivel
   ?<button type="button" className="sn-enable" onClick={enable} disabled={busy}>
      {busy?'Configurando aparelho...':'Ativar notificações neste celular'}
    </button>
   :<div className="sn-setup-info">
      <strong>Avisos no SPLASH ativos</strong>
      <span>Você já pode consultar as notificações aqui. Para receber alertas nativos no celular, falta configurar as chaves VAPID e o HTTPS do domínio na hospedagem.</span>
    </div>}
  {notice&&<p role="status" className="sn-note">{notice}</p>}
  {error&&<p role="alert" className="sn-error">{error}</p>}
  {!data.avisos.length?<p className="sn-empty">Ainda não existem avisos na sua conta.</p>:
  <div className="sn-list">{data.avisos.map(a=><button key={a.id} className={'sn-item'+(!a.lido_em?' unread':'')}
    type="button" onClick={()=>open(a)}>
      <strong>{a.titulo}</strong><span>{a.mensagem}</span>
      <small>{dateBR(a.criado_em,true)}{a.lido_em?' · Lida':' · Nova'}</small>
    </button>)}</div>}
  <p className="sn-footnote">As comissões mostradas são somente as suas. Valores em apuração não representam pagamentos confirmados.</p>
 </div>
}
