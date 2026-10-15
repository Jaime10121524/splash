import {isNative} from './nativeApi.js'

// Áudio opcional para avisos enquanto uma aba do SPLASH permanece aberta.
// A API Web Audio só é liberada após uma interação do usuário.
let audioContext=null

export function prepareDesktopSound(){
 if(isNative() || typeof window==='undefined')return
 const Constructor=window.AudioContext||window.webkitAudioContext
 if(!Constructor)return
 try{
  if(!audioContext)audioContext=new Constructor()
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{})
 }catch{/* O alerta visual continua disponível quando o áudio está bloqueado. */}
}

function playDesktopSound(){
 if(!audioContext||audioContext.state!=='running')return
 try{
  const now=audioContext.currentTime
  for(const [offset,freq] of [[0,780],[0.17,1046]]){
   const osc=audioContext.createOscillator()
   const gain=audioContext.createGain()
   osc.type='sine'
   osc.frequency.value=freq
   gain.gain.setValueAtTime(0.0001,now+offset)
   gain.gain.exponentialRampToValueAtTime(0.12,now+offset+0.016)
   gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.13)
   osc.connect(gain)
   gain.connect(audioContext.destination)
   osc.start(now+offset)
   osc.stop(now+offset+0.14)
  }
 }catch{/* Não impedir a notificação se o dispositivo não permitir áudio. */}
}

// Mostra uma notificação do sistema, sem abrir pop-ups de permissão.
// Também serve de apoio ao push quando a página está aberta em outra aba.
export async function showDesktopNotice(item){
 if(isNative() || typeof window==='undefined' || !('Notification' in window)
    || Notification.permission!=='granted')return false
 const title=String(item.titulo||'SPLASH').slice(0,145)
 const body=String(item.mensagem||'Você recebeu um novo aviso.').slice(0,450)
 const validRoutes=['vendas','atendimentos','titulos','pendencias','relatorios']
 const route=validRoutes.includes(item.rota)?item.rota:null
 const url=route?'/?go='+encodeURIComponent(route):'/'
 const tag=String(item.chave_evento||('splash-notice-'+(item.id||Date.now()))).slice(0,120)
 const options={
  body,tag,icon:'/favicon.svg',badge:'/favicon.svg',
  data:{url},renotify:item.categoria==='VENDA_PAGA',silent:false,
 }
 try{
  if('serviceWorker' in navigator){
   const reg=await navigator.serviceWorker.getRegistration('/')
   if(reg){
    await reg.showNotification(title,options)
    playDesktopSound()
    return true
   }
  }
  new Notification(title,options)
  playDesktopSound()
  return true
 }catch{return false}
}
