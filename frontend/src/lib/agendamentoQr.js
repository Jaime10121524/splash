import QRCode from 'qrcode'

// Voucher PNG completo. O QR leva somente o token opaco; a validação exige login.
export async function conviteImagem(agenda) {
  const token=String(agenda.qr_token||'')
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('QR Code deste agendamento não está disponível.')
  const broker=String(agenda.captador_nome||'').trim()
  if(!broker)throw new Error('Nome do corretor não foi carregado. Atualize a agenda e tente novamente.')
  const qrData=await QRCode.toDataURL('SPLASH:AG:1:'+token,{
    errorCorrectionLevel:'M',width:560,margin:4,color:{dark:'#24184E',light:'#FFFFFFFF'}
  })
  const canvas=document.createElement('canvas')
  canvas.width=1080;canvas.height=2080
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Este navegador não permite gerar imagem.')

  const rounded=(x,y,w,h,r,color)=>{
    ctx.beginPath()
    ctx.roundRect(x,y,w,h,r)
    ctx.fillStyle=color
    ctx.fill()
  }
  const text=(value,x,y,size,color='#24184E',weight=700,align='left')=>{
    ctx.font=weight+' '+size+'px system-ui, sans-serif'
    ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value),x,y)
  }
  const wrap=(value,maxWidth,size,weight=700)=>{
    ctx.font=weight+' '+size+'px system-ui, sans-serif'
    const words=String(value).trim().split(/\s+/)
    const lines=[];let line=''
    for(const word of words){
      const next=line?line+' '+word:word
      if(line && ctx.measureText(next).width>maxWidth){lines.push(line);line=word}
      else line=next
    }
    if(line)lines.push(line)
    return lines
  }

  const bg=ctx.createLinearGradient(0,0,1080,2080)
  bg.addColorStop(0,'#24184E');bg.addColorStop(1,'#6548DC')
  ctx.fillStyle=bg;ctx.fillRect(0,0,1080,2080)
  ctx.globalAlpha=.12;rounded(760,-120,410,410,205,'#FFFFFF');ctx.globalAlpha=1
  text('SPLASH PARK',540,89,68,'#FFFFFF',900,'center')
  text('FAZENDINHA',540,155,55,'#E3D7FF',900,'center')
  text('VOUCHER DE VISITA AGENDADA',540,204,25,'#FFFFFF',800,'center')

  rounded(55,245,970,1735,45,'#FFFFFF')
  text('VOCÊ SERÁ ATENDIDO PELO CORRETOR:',540,314,27,'#624CDE',900,'center')
  let brokerSize=56;let brokerLines=wrap(broker,850,brokerSize,900)
  while(brokerLines.length>2 && brokerSize>35){brokerSize-=2;brokerLines=wrap(broker,850,brokerSize,900)}
  brokerLines.slice(0,2).forEach((line,i)=>text(line,540,385+i*63,brokerSize,'#24184E',900,'center'))
  rounded(100,474,880,2,1,'#E9E1FF')

  text('NOME DO CLIENTE',107,524,24,'#7861F9',900)
  const clientLines=wrap(agenda.nome_completo||'',860,39,850)
  clientLines.slice(0,2).forEach((line,i)=>text(line,107,571+i*44,39,'#24184E',850))
  rounded(100,669,880,124,22,'#F3EFFF')
  const day=String(agenda.data_visita||'').split('-')
  const date=day.length===3?day[2]+'/'+day[1]+'/'+day[0]:String(agenda.data_visita||'')
  text('DATA DA VISITA',133,711,22,'#736594',900)
  text(date,133,764,42,'#24184E',900)
  text('QUANTIDADE DE PESSOAS',690,711,21,'#736594',900)
  text(String(agenda.quantidade_pessoas),690,764,42,'#24184E',900)

  const img=new Image()
  await new Promise((resolve,reject)=>{
    img.onload=resolve;img.onerror=reject;img.src=qrData
  })
  ctx.drawImage(img,350,808,380,380)
  text('APRESENTE ESTE QR CODE NA RECEPÇÃO',540,1235,26,'#24184E',900,'center')
  text('AGENDAMENTO Nº '+agenda.id,540,1270,22,'#624CDE',850,'center')

  rounded(100,1305,880,272,24,'#F5F2FF')
  text('O QUE VOCÊ VAI TER NESSA VISITA',131,1356,31,'#24184E',900)
  const benefits=[
    'Tour guiado pelo clube',
    'Café de boas-vindas chegando até as 10 horas',
    'Apresentação de condições exclusivas para associação',
    'Utilização da área rural após atendimento',
  ]
  benefits.forEach((b,i)=>text((i+1)+'. '+b,136,1411+i*43,25,'#35295C',600))

  text('REGRAS DO VOUCHER',130,1633,32,'#24184E',900)
  const rules=[
    'Somente na data agendada',
    'Recepção das 08 às 18 horas',
    'Não inclui uso do parque aquático antes da associação',
    'Toda e qualquer promoção é válida somente para o dia da visita',
    'Sujeito à programação e funcionamento do clube',
  ]
  rules.forEach((r,i)=>text((i+1)+'. '+r,136,1681+i*42,23,'#35295C',600))

  rounded(100,1901,880,2,1,'#DDD4F3')
  text('ENDEREÇO',130,1936,22,'#624CDE',900)
  text('Estrada do Frutuoso, 315, Santa Cruz, Rio de Janeiro - RJ',130,1966,24,'#24184E',750)
  text('SPLASH PARK FAZENDINHA  •  VÁLIDO APENAS NA DATA AGENDADA',540,2033,21,'#E2D9FF',700,'center')
  return canvas.toDataURL('image/png')
}

export async function baixarConvite(agenda) {
  const uri=await conviteImagem(agenda)
  const link=document.createElement('a')
  link.href=uri;link.download='splash-park-fazendinha-voucher-'+agenda.id+'.png'
  document.body.appendChild(link);link.click();link.remove()
}
