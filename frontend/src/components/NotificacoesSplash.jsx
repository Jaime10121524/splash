import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR} from '../lib/comercialApi.js'
import './NotificacoesSplash.css'

function decodeKey(encoded){
 const padding='='.repeat((4-encoded.length%4)%4)
 const raw=atob((encoded+padding).replace(/-/g,'+').replace(/_/g,'/'))
 return Uint8Array.from(raw,ch=>ch.charCodeAt(0))
}
export async function stopCurrentPush(){
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
 async function enable(){
  setError('');setNotice('')
  if(!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)
    || !('PushManager' in window)){
    setError('Este navegador não oferece Web Push neste contexto. Use HTTPS e instale o app quando necessário.')
    return
  }
  if(!data.push_disponivel){
    setError('O administrador ainda precisa configurar Web Push/VAPID na hospedagem.')
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
  <button type="button" className="sn-enable" onClick={enable} disabled={busy}>
    {busy?'Configurando aparelho...':'Ativar notificações neste celular'}
  </button>
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
