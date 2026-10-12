import './WhatsAppLink.css'

/** Only render links for numbers actually stored on the customer record. */
export function whatsappUrl(phone, message=''){
  const raw=String(phone??'').replace(/\D/g,'')
  const number=raw.startsWith('55')&&[12,13].includes(raw.length)
    ?raw:[10,11].includes(raw.length)?'55'+raw:null
  if(!number)return null
  const params=message?'?text='+encodeURIComponent(message):''
  return 'https://wa.me/'+number+params
}
export default function WhatsAppLink({phone,message='',label='WhatsApp'}){
  const url=whatsappUrl(phone,message)
  if(!url)return null
  return <a href={url} target="_blank" rel="noopener noreferrer"
    className="splash-whatsapp" aria-label={'Conversar pelo WhatsApp: '+label}>
    <span aria-hidden="true">↗</span> {label}
  </a>
}
