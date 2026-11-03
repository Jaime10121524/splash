import {useEffect} from 'react'
import './TransientNotice.css'

/** Avisos informativos, sem decisão, desaparecem em cinco segundos. */
export default function TransientNotice({message,onClose,kind='success',duration=5000}) {
  useEffect(()=>{
    if(!message)return
    const timeout=window.setTimeout(onClose,duration)
    return ()=>window.clearTimeout(timeout)
  },[message,duration,onClose])
  if(!message)return null
  return <div className={'splash-toast '+kind} role="status" key={message}>
    <div className="splash-toast-content">
      <span aria-hidden="true" className="splash-toast-icon">{kind==='error'?'!':'✓'}</span>
      <p>{message}</p>
      <button type="button" aria-label="Fechar aviso" onClick={onClose}>×</button>
    </div>
    <div className="splash-toast-track"><div className="splash-toast-progress"
      style={{animationDuration:duration+'ms'}}/></div>
  </div>
}
