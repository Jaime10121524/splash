import QRCode from 'qrcode'

// Voucher vertical 9:16 (1080 x 1920), apropriado para tela e WhatsApp.
// O QR transporta somente o token; o check-in exige login autorizado.
export async function conviteImagem(agenda) {
  const token=String(agenda.qr_token||'')
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('QR Code deste agendamento não está disponível.')
  const broker=String(agenda.captador_nome||'').trim()
  if(!broker)throw new Error('Corretor não carregado. Atualize a agenda para gerar o voucher.')

  const qrData=await QRCode.toDataURL('SPLASH:AG:1:'+token,{
    errorCorrectionLevel:'M',width:440,margin:4,color:{dark:'#24184E',light:'#FFFFFFFF'}
  })
  const canvas=document.createElement('canvas')
  canvas.width=1080;canvas.height=1920
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Este navegador não permite gerar imagem.')

  const rounded=(x,y,w,h,r,color)=>{
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill()
  }
  const text=(value,x,y,size,color='#24184E',weight=700,align='left')=>{
    ctx.font=weight+' '+size+'px system-ui, sans-serif'
    ctx.fillStyle=color;ctx.textAlign=align
    ctx.fillText(String(value),x,y)
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
  const fitLines=(value,maxWidth,initial,min=25,weight=900)=>{
    let size=initial,lines=wrap(value,maxWidth,size,weight)
    while(lines.length>2 && size>min){size-=2;lines=wrap(value,maxWidth,size,weight)}
    if(lines.length>2){
      const remaining=lines.slice(1).join(' ')
      let second=remaining
      ctx.font=weight+' '+size+'px system-ui, sans-serif'
      while(second.length>3 && ctx.measureText(second+'…').width>maxWidth)second=second.slice(0,-1)
      lines=[lines[0],second+'…']
    }
    return {size,lines}
  }

  const bg=ctx.createLinearGradient(0,0,1080,1920)
  bg.addColorStop(0,'#24184E');bg.addColorStop(1,'#624CDE')
  ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1920)
  ctx.globalAlpha=.12;rounded(790,-100,400,400,200,'#FFFFFF');ctx.globalAlpha=1
  text('SPLASH PARK',540,74,61,'#FFFFFF',900,'center')
  text('FAZENDINHA',540,124,43,'#E3D7FF',900,'center')
  text('VOUCHER DE VISITA AGENDADA',540,158,22,'#FFFFFF',900,'center')

  rounded(58,183,964,1665,38,'#FFFFFF')
  text('VOCÊ SERÁ ATENDIDO PELO CORRETOR:',540,238,25,'#624CDE',900,'center')
  const b=fitLines(broker,840,51,30)
  b.lines.forEach((line,i)=>text(line,540,304+i*54,b.size,'#24184E',900,'center'))
  rounded(105,383,870,2,1,'#E6DEFF')

  text('NOME DO CLIENTE',115,421,23,'#624CDE',900)
  const client=fitLines(agenda.nome_completo||'',850,36,26)
  client.lines.forEach((line,i)=>text(line,115,468+i*41,client.size,'#24184E',900))

  rounded(104,542,872,119,22,'#F3EFFF')
  const day=String(agenda.data_visita||'').split('-')
  const date=day.length===3?day[2]+'/'+day[1]+'/'+day[0]:String(agenda.data_visita||'')
  text('DATA DA VISITA',135,585,22,'#736594',900)
  text(date,135,638,39,'#24184E',900)
  text('QUANTIDADE DE PESSOAS',696,585,20,'#736594',900)
  text(String(agenda.quantidade_pessoas),696,638,39,'#24184E',900)

  const img=new Image()
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=qrData})
  // Bloco QR horizontal: mais espaço para instruções sem aumentar a altura do voucher.
  ctx.drawImage(img,160,694,290,290)
  text('APRESENTE O QR CODE',480,797,27,'#24184E',900)
  text('NA RECEPÇÃO',480,835,27,'#24184E',900)
  text('AGENDAMENTO Nº '+agenda.id,480,895,23,'#624CDE',900)
  text('A leitura registra apenas a chegada.',480,937,20,'#736594',650)

  rounded(104,1011,872,252,22,'#F5F2FF')
  text('O QUE VOCÊ VAI TER NESSA VISITA',131,1056,30,'#24184E',900)
  const benefits=[
    'Tour guiado pelo clube',
    'Café de boas-vindas chegando até as 10 horas',
    'Apresentação de condições exclusivas para associação',
    'Utilização da área rural após atendimento',
  ]
  benefits.forEach((item,i)=>text((i+1)+'. '+item,138,1103+i*46,22,'#35295C',650))

  rounded(104,1283,872,320,22,'#FAF8FF')
  text('REGRAS DO VOUCHER',131,1329,31,'#24184E',900)
  const rules=[
    'Somente na data agendada',
    'Recepção das 08 às 18 horas',
    'Não inclui uso do parque aquático antes da associação',
    'Toda e qualquer promoção é válida somente para o dia da visita',
    'Sujeito à programação e funcionamento do clube',
  ]
  rules.forEach((item,i)=>text((i+1)+'. '+item,138,1381+i*46,22,'#35295C',650))

  rounded(104,1624,872,2,1,'#E6DEFF')
  text('ENDEREÇO',129,1675,22,'#624CDE',900)
  const addressLines=wrap('Estrada do Frutuoso, 315, Santa Cruz, Rio de Janeiro - RJ',816,26,800)
  addressLines.forEach((line,i)=>text(line,129,1724+i*34,26,'#24184E',800))
  text('Válido apenas na data agendada.',129,1813,21,'#736594',650)
  text('SPLASH PARK FAZENDINHA',540,1887,22,'#FFFFFF',900,'center')
  return canvas.toDataURL('image/png')
}

export async function baixarConvite(agenda) {
  const uri=await conviteImagem(agenda)
  const link=document.createElement('a')
  link.href=uri;link.download='splash-park-fazendinha-voucher-'+agenda.id+'.png'
  document.body.appendChild(link);link.click();link.remove()
}
