import QRCode from 'qrcode'

// Convite em imagem PNG 1080x1350; somente o token opaco vai no QR.
// Para efetuar check-in é obrigatório autenticação no Splash.
export async function conviteImagem(agenda) {
  const token=String(agenda.qr_token||'')
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('QR Code deste agendamento não está disponível.')
  const qrData=await QRCode.toDataURL('SPLASH:AG:1:'+token,{
    errorCorrectionLevel:'M',width:590,margin:3,color:{dark:'#24184E',light:'#FFFFFFFF'}
  })
  const canvas=document.createElement('canvas')
  canvas.width=1080;canvas.height=1350
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Este navegador não permite gerar imagem.')
  const background=ctx.createLinearGradient(0,0,1080,1350)
  background.addColorStop(0,'#24184E');background.addColorStop(0.65,'#453188')
  background.addColorStop(1,'#7861F9')
  ctx.fillStyle=background;ctx.fillRect(0,0,1080,1350)

  const round=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  ctx.globalAlpha=.14;ctx.fillStyle='#DBD2FF';round(690,-80,440,440,220)
  ctx.globalAlpha=1;ctx.textAlign='center'
  ctx.fillStyle='#CFC3FF';ctx.font='700 28px system-ui'
  ctx.fillText('S P L A S H   N E X T',540,95)
  ctx.fillStyle='#FFFFFF';ctx.font='900 68px system-ui'
  ctx.fillText('Sua visita começa aqui.',540,168)

  ctx.fillStyle='#FFFFFF';round(78,210,924,1010,52)
  ctx.fillStyle='#7861F9';ctx.font='800 26px system-ui'
  ctx.fillText('AGENDAMENTO CONFIRMADO',540,270)
  ctx.fillStyle='#24184E';ctx.font='800 49px system-ui'
  let name=String(agenda.nome_completo||'').trim()
  while(ctx.measureText(name).width>810&&name.length>12) name=name.slice(0,-2)+'…'
  ctx.fillText(name,540,337)
  ctx.fillStyle='#736889';ctx.font='500 30px system-ui'
  const day=String(agenda.data_visita||'').split('-')
  const date=day.length===3?day[2]+'/'+day[1]+'/'+day[0]:agenda.data_visita
  ctx.fillText('Visita '+date+'   ·   '+agenda.quantidade_pessoas+' pessoa(s)',540,389)

  const img=new Image()
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=qrData})
  ctx.drawImage(img,240,434,600,600)

  ctx.fillStyle='#24184E';ctx.font='800 33px system-ui'
  ctx.fillText('Apresente este QR na chegada',540,1090)
  ctx.fillStyle='#938AA6';ctx.font='500 22px system-ui'
  ctx.fillText('Conferência feita pela equipe autorizada do clube',540,1138)
  ctx.fillStyle='#7861F9';ctx.font='800 21px system-ui'
  ctx.fillText('AGENDAMENTO Nº '+agenda.id,540,1183)

  ctx.fillStyle='#E1D7FF';ctx.font='600 22px system-ui'
  ctx.fillText('Seu acesso será conferido na recepção',540,1296)
  return canvas.toDataURL('image/png')
}

export async function baixarConvite(agenda) {
  const uri=await conviteImagem(agenda)
  const link=document.createElement('a')
  link.href=uri;link.download='splash-agendamento-'+agenda.id+'.png'
  document.body.appendChild(link);link.click();link.remove()
}
