import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import './UiFields.css'

/**
 * Componentes de formulário SPLASH.
 * Select, Date, Time e DateTime compartilham tokens, layout e popup em Portal.
 * Os popups não ficam escondidos por overflow de modal/grid.
 */
function usePopup(open, anchor, contentRef) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 210, maxHeight: 320 })
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const availableBelow = window.innerHeight - rect.bottom - 12
      const availableAbove = rect.top - 12
      const above = availableBelow < 200 && availableAbove > availableBelow
      const maxHeight = Math.max(140, Math.min(330, (above ? availableAbove : availableBelow) - 6))
      const width = Math.min(Math.max(rect.width, 190), window.innerWidth - 20)
      setPosition({
        top: above ? Math.max(10, rect.top - maxHeight - 6) : Math.min(window.innerHeight - 145, rect.bottom + 5),
        left: Math.min(Math.max(rect.left, 10), window.innerWidth - width - 10),
        width, maxHeight,
      })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const clickAway = event => {
      if (!anchor.current?.contains(event.target) && !contentRef.current?.contains(event.target)) {
        contentRef.current?.dispatchEvent(new CustomEvent('splash-dismiss'))
      }
    }
    document.addEventListener('pointerdown', clickAway)
    return () => document.removeEventListener('pointerdown', clickAway)
  }, [open, anchor, contentRef])
  return position
}
const Chevron = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
const CalendarIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="18" height="18" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>
const ClockIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>

export function SelectInput({value, onChange, options, placeholder='Selecione', disabled=false, ariaLabel}) {
  const anchor = useRef(null)
  const popup = useRef(null)
  const listId = useId()
  const [open,setOpen] = useState(false)
  const [highlight,setHighlight] = useState(0)
  const position = usePopup(open, anchor, popup)
  const values = options.map(o => typeof o === 'object' ? o : {value:o,label:String(o)})
  const selected = values.find(o => String(o.value) === String(value))
  useEffect(() => {
    if (!open) return
    const idx = values.findIndex(o => String(o.value) === String(value))
    setHighlight(Math.max(0, idx))
  }, [open, value])
  useEffect(() => {
    if (!open) return
    const dismiss = () => setOpen(false)
    const element = popup.current
    element?.addEventListener('splash-dismiss', dismiss)
    return () => element?.removeEventListener('splash-dismiss', dismiss)
  }, [open])
  function pick(index) {
    const option = values[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    anchor.current?.focus()
  }
  function keyboard(event) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setHighlight(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      setHighlight(event.key==='Home'?0:values.length-1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) pick(highlight)
      else setOpen(true)
    } else if (event.key === 'Escape') {
      if (open) event.stopPropagation()
      setOpen(false)
    }
  }
  return <>
    <button type="button" className={'ui-input ui-select-trigger'+(open?' open':'')} ref={anchor}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined}
      aria-label={ariaLabel||placeholder} disabled={disabled}
      onClick={()=>setOpen(v=>!v)} onKeyDown={keyboard}>
      <span className={!selected?'ui-placeholder':''}>{selected?.label||placeholder}</span><Chevron/>
    </button>
    {open && createPortal(<div className="ui-floating ui-select-menu" ref={popup}
      id={listId} role="listbox" aria-label={ariaLabel||placeholder}
      style={{top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight}}
      onKeyDown={keyboard}>
      {values.map((option,index)=><button key={index} type="button" role="option"
        aria-selected={selected?.value===option.value} disabled={option.disabled}
        className={'ui-choice'+(highlight===index?' hovered':'')+(selected?.value===option.value?' selected':'')}
        onMouseEnter={()=>setHighlight(index)} onClick={()=>pick(index)}>
        <span>{option.label}</span>{selected?.value===option.value&&<span aria-hidden="true">✓</span>}
      </button>)}
    </div>,document.body)}
  </>
}

function pad(value) {return String(value).padStart(2,'0')}
function toISO(value) {
  const result = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!result) return null
  const [, dd, mm, yyyy] = result
  const year=Number(yyyy), month=Number(mm), day=Number(dd)
  if(year < 1900 || year > 2200) return null
  const d = new Date(year,month-1,day)
  if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return null
  return yyyy+'-'+mm+'-'+dd
}
function toBR(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return ''
  return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4)
}
const weekday = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function DateInput({value='',onChange,placeholder='dd/mm/aaaa',disabled=false,ariaLabel='Data'}) {
  const anchor=useRef(null)
  const popup=useRef(null)
  const [open,setOpen]=useState(false)
  const [text,setText]=useState(toBR(value))
  const [month,setMonth]=useState(()=>{
    const current=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):new Date()
    return new Date(current.getFullYear(),current.getMonth(),1)
  })
  const position=usePopup(open,anchor,popup)
  useEffect(()=>setText(toBR(value)),[value])
  useEffect(()=>{
    if (!open) return
    const dismiss=()=>setOpen(false)
    const el=popup.current
    el?.addEventListener('splash-dismiss',dismiss)
    return ()=>el?.removeEventListener('splash-dismiss',dismiss)
  },[open])
  function commit() {
    if(text.trim()==='') { onChange('');return }
    const parsed=toISO(text)
    if(parsed) onChange(parsed)
    else setText(toBR(value))
  }
  function openCalendar() {
    if(disabled)return
    const d=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):new Date()
    setMonth(new Date(d.getFullYear(),d.getMonth(),1))
    setOpen(s=>!s)
  }
  const prefix=new Date(month.getFullYear(),month.getMonth(),1).getDay()
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
  const cells=Array.from({length:Math.ceil((prefix+days)/7)*7},(_,i)=>{
    const n=i-prefix+1
    return n>=1&&n<=days?n:null
  })
  const today = new Date()
  return <>
    <div className="ui-date-wrap" ref={anchor}>
      <input type="text" className="ui-input" value={text} disabled={disabled}
        inputMode="numeric" placeholder={placeholder} aria-label={ariaLabel}
        onChange={e=>setText(e.target.value.slice(0,10))}
        onBlur={commit} onKeyDown={e=>{
          if(e.key==='Enter') {e.preventDefault();commit();setOpen(false)}
          if(e.key==='Escape')setOpen(false)
          if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();openCalendar()}
        }}/>
      <button className="ui-input-icon" type="button" onClick={openCalendar}
        aria-label={'Abrir calendário: '+ariaLabel} aria-expanded={open} disabled={disabled}><CalendarIcon/></button>
    </div>
    {open&&createPortal(<div className="ui-floating ui-calendar" ref={popup}
      style={{top:position.top,left:position.left,width:Math.max(278,position.width),maxHeight:position.maxHeight}}
      onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);anchor.current?.querySelector('input')?.focus()}}}>
      <div className="ui-calendar-head">
        <button type="button" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))} aria-label="Mês anterior">‹</button>
        <strong>{months[month.getMonth()]} {month.getFullYear()}</strong>
        <button type="button" onClick={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))} aria-label="Próximo mês">›</button>
      </div>
      <div className="ui-calendar-grid">{weekday.map(d=><span className="ui-weekday" key={d}>{d}</span>)}
        {cells.map((n,i)=>{
          const iso=n?month.getFullYear()+'-'+pad(month.getMonth()+1)+'-'+pad(n):''
          const isToday=n&&today.getDate()===n&&today.getMonth()===month.getMonth()&&today.getFullYear()===month.getFullYear()
          return n?<button type="button" className={'ui-day'+(iso===value?' picked':'')+(isToday?' today':'')}
            key={i} onClick={()=>{onChange(iso);setText(toBR(iso));setOpen(false)}} aria-label={toBR(iso)}>{n}</button>
            :<span key={i} className="ui-day-empty"/>
        })}
      </div>
      <div className="ui-calendar-foot"><button type="button" onClick={()=>{onChange('');setText('');setOpen(false)}}>Limpar</button>
        <button type="button" onClick={()=>{const n=new Date();const d=n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate());onChange(d);setText(toBR(d));setOpen(false)}}>Hoje</button></div>
    </div>,document.body)}
  </>
}

export function TimeInput({value='',onChange,ariaLabel='Hora',disabled=false}) {
  const [text,setText]=useState(value||'')
  const [open,setOpen]=useState(false)
  const anchor=useRef(null)
  const popup=useRef(null)
  const position=usePopup(open,anchor,popup)
  useEffect(()=>setText(value||''),[value])
  useEffect(()=>{
    if (!open)return
    const dismiss=()=>setOpen(false)
    const el=popup.current
    el?.addEventListener('splash-dismiss',dismiss)
    return ()=>el?.removeEventListener('splash-dismiss',dismiss)
  },[open])
  const hours=Array.from({length:48},(_,i)=>pad(Math.floor(i/2))+':'+(i%2?'30':'00'))
  const validTime=txt=>/^([01]\d|2[0-3]):[0-5]\d$/.test(txt)
  function commit() {
    if(!text.trim())onChange('')
    else if(validTime(text))onChange(text)
    else setText(value||'')
  }
  return <>
    <div className="ui-date-wrap" ref={anchor}>
      <input className="ui-input" type="text" inputMode="numeric" maxLength={5} value={text} placeholder="hh:mm" aria-label={ariaLabel}
        disabled={disabled} onChange={e=>setText(e.target.value)} onBlur={commit}
        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();setOpen(false)}if(e.key==='Escape')setOpen(false)}}/>
      <button className="ui-input-icon" type="button" disabled={disabled} onClick={()=>setOpen(v=>!v)} aria-label="Selecionar hora"><ClockIcon/></button>
    </div>
    {open&&createPortal(<div className="ui-floating ui-time-grid" ref={popup}
      style={{top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight}}>
      {hours.map(h=><button key={h} type="button" className={'ui-choice'+(h===value?' selected':'')} onClick={()=>{onChange(h);setText(h);setOpen(false)}}>{h}</button>)}
    </div>,document.body)}
  </>
}

export function DateTimeInput({value='',onChange,disabled=false}) {
  const date=value ? value.slice(0,10) : ''
  const time=value ? value.slice(11,16) : ''
  return <div className="ui-datetime">
    <DateInput disabled={disabled} value={date} ariaLabel="Data" onChange={next=>onChange(next ? next+'T'+(time||'00:00') : '')}/>
    <TimeInput disabled={disabled} value={time} ariaLabel="Hora" onChange={next=>onChange(date ? date+'T'+(next||'00:00') : '')}/>
  </div>
}

export function FormControl({type='text',value,onChange,options=[],...rest}) {
  switch(type) {
    case 'select': return <SelectInput value={value} onChange={onChange} options={options} {...rest}/>
    case 'date': return <DateInput value={value} onChange={onChange} {...rest}/>
    case 'datetime': return <DateTimeInput value={value} onChange={onChange} {...rest}/>
    case 'time': return <TimeInput value={value} onChange={onChange} {...rest}/>
    default: return <input type={type} className="ui-input" value={value} onChange={e=>onChange(e.target.value)} {...rest}/>
  }
}
