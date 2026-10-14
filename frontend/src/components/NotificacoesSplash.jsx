import {PushNotifications} from '@capacitor/push-notifications'
import {isNative} from '../lib/nativeApi.js'
import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR} from '../lib/comercialApi.js'
import './NotificacoesSplash.css'

const firebaseDiagnostico={
 caminho_nao_configurado:'HostGator: a variavel SPLASH_FIREBASE_SERVICE_ACCOUNT nao foi configurada no .env privado.',
 arquivo_nao_encontrado:'HostGator: o arquivo privado da conta de servico Firebase nao existe no caminho indicado no .env.',
 sem_permissao_leitura:'HostGator: o PHP nao consegue ler o arquivo da conta de servico Firebase. Confira as permissoes.',
 local_publico_proibido:'HostGator: a chave privada do Firebase esta em uma pasta publica. Mova-a para splash-backend/secrets.',
 json_invalido:'HostGator: o arquivo da conta de servico Firebase nao e um JSON valido.',
 credenciais_invalidas:'HostGator: o JSON nao e uma conta de servico Firebase valida. O google-services.json do APK nao substitui essa chave.',
 extensao_php_ausente:'HostGator: habilite as extensoes PHP curl e openssl.',
}

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
   try{await PushNotifications.unregister()}catch{}
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
export default function NotificacoesSplash({navigate,onUnreadChange=()=>{}}){
 const [data,setData]=useState({avisos:[],nao_lidas:0,push_disponivel:false,vapid_publica:''})
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 async function refresh(){
  try{const r=await comercialGet('/api/notificacoes');setData(r);onUnreadChange(Number(r.nao_lidas||0));setError('')}
  catch(e){setError(e.message)}
 }
 useEffect(()=>{
  refresh()
  const id=setInterval(refresh,30000)
  return ()=>clearInterval(id)
 },[])
 async function enableNative(){
  setError('');setNotice('')
  if(!data.push_nativo_disponivel){
   setNotice(firebaseDiagnostico[data.push_nativo_diagnostico] || 'O APK ja possui Firebase, mas a API da HostGator ainda nao confirmou uma conta de servico Firebase valida. Atualize o backend ou solicite verificacao ao administrador.')
   return
  }
  setBusy(true)
  try{
   const permission=await PushNotifications.requestPermissions()
   if(permission.receive!=='granted')throw new Error('Permissão de notificações negada no Android.')
   await PushNotifications.createChannel({
    id:'splash_venda_paga',name:'Vendas pagas',
    description:'Pagamentos integrais confirmados',importance:5,visibility:1,vibration:true,
   })
   await PushNotifications.createChannel({
    id:'splash_avisos',name:'Avisos Splash',description:'Visitas e atualizações comerciais',
    importance:4,visibility:1,vibration:true,
   })
   await PushNotifications.removeAllListeners()
   await PushNotifications.addListener('registration',async result=>{
    try{
     await comercialPost('/api/notificacoes/nativo',{token:result.value,plataforma:'android'})
     localStorage.setItem('splash_android_push_token',result.value)
     setNotice('Android cadastrado. Para receber avisos, mantenha as notificações permitidas nas configurações do sistema.')
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
    setNotice('Navegador cadastrado para Web Push. A entrega depende das permissões do sistema e da hospedagem.')
    refresh()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 async function readAll(){
  if(busy||!data.nao_lidas)return
  setBusy(true);setError('')
  try{
   const r=await comercialPost('/api/notificacoes/ler-todas',{})
   setNotice(r.message);await refresh()
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
    <div className="sn-actions">
      <button onClick={readAll} type="button" disabled={busy||!data.nao_lidas}>Ler todas</button>
      <button onClick={refresh} type="button" aria-label="Atualizar avisos">Atualizar</button>
    </div></div>
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
