import { useEffect, useState } from 'react'
import { FormControl } from './UiFields.jsx'
import PhoneInput, { formatPhone } from './PhoneInput.jsx'
import { comercialGet, personOptions } from '../lib/comercialApi.js'
import './ComercialForms.css'

export function SurfaceModal({ title, subtitle, children, onClose, busy }) {
  useEffect(() => {
    const handle = event => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose,busy])
  return <div className="cm-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget && !busy) onClose()
  }}>
    <section className="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-title">
      <header className="cm-dialog-header">
        <div><small>SPLASH / COMERCIAL</small><h2 id="cm-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="cm-close" onClick={onClose} disabled={busy} aria-label="Fechar">×</button>
      </header>
      {children}
    </section>
  </div>
}

export function ClientFinder({ value, onChange, label='Pesquisar cliente', omitId=null }) {
  const [query,setQuery] = useState('')
  const [choices,setChoices] = useState([])
  const [waiting,setWaiting] = useState(false)
  const [failed,setFailed] = useState('')
  useEffect(() => {
    if (value || query.trim().length < 2) {
      setChoices([])
      return undefined
    }
    let cancelled=false
    const timer=setTimeout(async () => {
      setWaiting(true)
      try {
        const payload=await comercialGet('/api/clientes?q='+encodeURIComponent(query.trim())+'&limit=15')
        if (!cancelled) {setChoices((payload.clientes||[]).filter(c => c.id!==omitId));setFailed('')}
      } catch(e) {if (!cancelled)setFailed(e.message)}
      finally {if (!cancelled)setWaiting(false)}
    },230)
    return () => {cancelled=true;clearTimeout(timer)}
  },[query,value,omitId])
  return <div className="cm-client-finder">
    <span className="cm-field-label">{label}</span>
    {value ? <div className="cm-selected-client">
      <div><strong>{value.nome}</strong><small>{formatPhone(value.telefone)||'Sem telefone'}</small></div>
      <button type="button" onClick={()=>{onChange(null);setQuery('')}}>Trocar</button>
    </div> : <>
      <input type="search" value={query} placeholder="Digite nome, telefone ou CPF..."
        onChange={e=>setQuery(e.target.value)} aria-label={label}/>
      {query.trim().length>=2 && <div className="cm-choices">
        {waiting ? <div className="cm-search-hint">Pesquisando...</div> : failed ? <div className="cm-search-hint">{failed}</div> :
          choices.length ? choices.map(c=><button type="button" key={c.id} onClick={()=>{onChange(c);setQuery('')}}>
            <strong>{c.nome}</strong><small>{formatPhone(c.telefone)}{c.dono_corrente_nome?' · Corrente: '+c.dono_corrente_nome:''}</small>
          </button>) : <div className="cm-search-hint">Nenhum cliente encontrado.</div>}
      </div>}
    </>}
  </div>
}

export function emptyClient() {
  return {
    nome:'',telefone:'',cpf:'',email:'',data_nascimento:'',endereco:'',
    profissao:'',observacoes:'',origem_id:'',indicador_cliente_id:null,
    dono_corrente_pessoa_id:'',ativo:true,motivo_corrente:'',
  }
}
export function normalizeClient(record) {
  return record ? {
    ...emptyClient(),...record,
    origem_id:record.origem_id ? String(record.origem_id) : '',
    dono_corrente_pessoa_id:record.dono_corrente_pessoa_id ? String(record.dono_corrente_pessoa_id):'',
    data_nascimento:record.data_nascimento||'',
    ativo:!!record.ativo,
    telefone:record.telefone||'',cpf:record.cpf||'',
    email:record.email||'',endereco:record.endereco||'',profissao:record.profissao||'',
    observacoes:record.observacoes||'',
  } : emptyClient()
}

export function ClientFields({ fields, onChange, catalogs, compact=false, original=null }) {
  const [referrer,setReferrer]=useState(
    original?.indicador_cliente_id ? {
      id:original.indicador_cliente_id,
      nome:original.indicador_nome||'Cliente indicador',
      telefone:'',
    } : null
  )
  const set=(key,value)=>onChange({ ...fields,[key]:value })
  const owners=personOptions(catalogs.pessoas||[],['corretor','vendedor'])
  const options=(catalogs.origens||[]).filter(o=>o.ativo || String(o.id)===String(fields.origem_id))
    .map(o=>({value:String(o.id),label:o.nome}))
  const inherited=!!referrer
  const ownerName=(catalogs.pessoas||[]).find(p=>String(p.id)===String(fields.dono_corrente_pessoa_id))?.nome
  return <div className="cm-form-fields">
    <label><span className="field-caption">Nome <em>*</em></span><input autoFocus required maxLength={160} value={fields.nome}
      onChange={e=>set('nome',e.target.value)} placeholder="Nome completo"/></label>
    <label><span className="cm-field-heading">Telefone <em>*</em></span>
      <PhoneInput required placeholder="(11) 99999-9999" value={fields.telefone}
        onChange={value=>set('telefone',value)}/></label>

    {!compact && <>
      <div className="cm-form-grid">
        <label>CPF<input inputMode="numeric" maxLength={18} placeholder="Somente se informado"
          value={fields.cpf} onChange={e=>set('cpf',e.target.value)}/></label>
        <label>Data de nascimento<FormControl type="date" value={fields.data_nascimento}
          onChange={value=>set('data_nascimento',value)} ariaLabel="Data de nascimento"/></label>
      </div>
      <div className="cm-form-grid">
        <label>E-mail<input type="email" maxLength={254} value={fields.email}
          onChange={e=>set('email',e.target.value)} placeholder="Opcional"/></label>
        <label>Profissão<input maxLength={100} value={fields.profissao}
          onChange={e=>set('profissao',e.target.value)} placeholder="Opcional"/></label>
      </div>
      <label>Endereço<textarea rows={2} maxLength={3000} value={fields.endereco}
        onChange={e=>set('endereco',e.target.value)} placeholder="Rua, bairro, cidade..."/></label>
    </>}

    <label>Origem do lead <FormControl type="select" value={fields.origem_id}
      onChange={value=>set('origem_id',value)} placeholder="Selecione a origem"
      ariaLabel="Origem do lead" options={options}/></label>
    <ClientFinder label="Quem indicou? (opcional)" value={referrer}
      omitId={original?.id} onChange={selected=>{
        setReferrer(selected)
        onChange({...fields,indicador_cliente_id:selected?.id||null,
          dono_corrente_pessoa_id:selected?.dono_corrente_pessoa_id
            ? String(selected.dono_corrente_pessoa_id) : fields.dono_corrente_pessoa_id})
      }}/>
    {inherited ? <div className="cm-inheritance">
      <strong>Corrente herdada da indicação</strong>
      <p>O responsável será determinado pelo cadastro do cliente indicador. Isso não transfere a corrente para o atendente.</p>
      {ownerName && <span>{ownerName}</span>}
    </div> : <label><span className="field-caption">Dono da corrente <em>*</em></span><FormControl type="select" value={fields.dono_corrente_pessoa_id}
      onChange={value=>set('dono_corrente_pessoa_id',value)} placeholder="Escolha o responsável"
      ariaLabel="Dono da corrente" options={owners}/></label>}

    {original && !inherited && String(original.dono_corrente_pessoa_id)!==String(fields.dono_corrente_pessoa_id) &&
      <label><span className="field-caption">Justificativa da mudança da corrente <em>*</em></span>
        <textarea rows={2} value={fields.motivo_corrente}
          onChange={e=>set('motivo_corrente',e.target.value)} placeholder="Por que o dono da corrente foi alterado?"/>
      </label>}
    {!compact && <>
      <label>Observações<textarea maxLength={3000} rows={3} value={fields.observacoes}
        onChange={e=>set('observacoes',e.target.value)} placeholder="Informações adicionais"/></label>
      <label className="cm-status-switch"><span><strong>Cliente ativo</strong><small>Disponível para novas visitas</small></span>
        <input type="checkbox" checked={fields.ativo} onChange={e=>set('ativo',e.target.checked)}/></label>
    </>}
  </div>
}
