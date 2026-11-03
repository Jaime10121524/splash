import { useEffect, useMemo, useState } from 'react'
import { comercialGet, comercialPost, dateBR, localDateISO, personOptions } from '../lib/comercialApi.js'
import { baixarConvite } from '../lib/agendamentoQr.js'
import { formatPhone } from '../components/PhoneInput.jsx'
import { SurfaceModal } from '../components/ComercialForms.jsx'
import './Agendamentos.css'

const cleanPhone=value=>String(value||'').replace(/\D/g,'').slice(0,11)
const options=(catalogs,role)=>personOptions(catalogs.pessoas||[],role).filter(p=>p.value!=='')
const fmt=v=>dateBR(v)
const stats=[['agendados','Agendados'],['compareceram','Compareceram'],['nao_compareceram','Não compareceram'],['vendas','Fechamentos']]
const initialForm={nome_completo:'',telefone:'',data_visita:localDateISO(),quantidade_pessoas:'1',captador_pessoa_id:'',observacoes:''}

export default function Agendamentos({navigate=()=>{}}) {
  const [rows,setRows]=useState([])
  const [summary,setSummary]=useState({})
  const [q,setQ]=useState('')
  const [catalogs,setCatalogs]=useState({pessoas:[],pessoa_logada:null})
  const [form,setForm]=useState(initialForm)
  const [modal,setModal]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [scan,setScan]=useState('')
  const [found,setFound]=useState(null)
  const [broker,setBroker]=useState('')
  const [second,setSecond]=useState('')
  const [attendant,setAttendant]=useState('')
  const [clientId,setClientId]=useState('')
  const [clients,setClients]=useState([])
  const [lookup,setLookup]=useState('')

  async function reload(){
    const r=await comercialGet('/api/agendamentos?q='+encodeURIComponent(q))
    setRows(r.agendamentos||[]);setSummary(r.indicadores||{})
    setError('')
  }
  useEffect(()=>{
    comercialGet('/api/comercial/opcoes').then(v=>{setCatalogs(v);setForm(f=>({...f,captador_pessoa_id:v.pessoa_logada?String(v.pessoa_logada):''}))})
      .catch(e=>setError(e.message))
  },[])
  useEffect(()=>{
    let active=true;setLoading(true)
    const timer=setTimeout(()=>{
      comercialGet('/api/agendamentos?q='+encodeURIComponent(q))
        .then(v=>{if(active){setRows(v.agendamentos||[]);setSummary(v.indicadores||{});setError('')}})
        .catch(e=>{if(active)setError(e.message)})
        .finally(()=>{if(active)setLoading(false)})
    },250)
    return ()=>{active=false;clearTimeout(timer)}
  },[q,notice])

  const brokers=useMemo(()=>options(catalogs,['corretor']),[catalogs])
  const attendants=useMemo(()=>options(catalogs,['vendedor','corretor']),[catalogs])
  const set=(key,v)=>setForm(f=>({...f,[key]:v}))

  async function create(e){
    e.preventDefault();setBusy(true);setError('')
    try{
      const r=await comercialPost('/api/agendamentos',{
        ...form,telefone:cleanPhone(form.telefone),
        quantidade_pessoas:Number(form.quantidade_pessoas),
        captador_pessoa_id:Number(form.captador_pessoa_id),
      })
      const data={
        id:r.agendamento_id,qr_token:r.qr_payload?.split(':').pop(),
        ...form,telefone:cleanPhone(form.telefone),
      }
      setModal(null);setNotice(r.message);setForm({
        ...initialForm, data_visita:localDateISO(),captador_pessoa_id:catalogs.pessoa_logada?String(catalogs.pessoa_logada):'',
      })
      await reload()
      await baixarConvite(data)
    }catch(err){setError(err.message)}
    finally{setBusy(false)}
  }

  async function inspect(qr){
    setBusy(true);setError('')
    try{
      const result=await comercialPost('/api/agendamentos/validar-qr',{qr:qr.trim()})
      const a=result.agendamento
      setFound(a)
      setBroker(String(a.corretor_confirmado_pessoa_id||a.captador_pessoa_id||''))
      setSecond(a.segundo_corretor_pessoa_id?String(a.segundo_corretor_pessoa_id):'')
      setAttendant(a.atendente_pessoa_id?String(a.atendente_pessoa_id):'')
      setClientId(a.cliente_id?String(a.cliente_id):'')
      setLookup(a.telefone);setClients([])
      setScan(qr.trim());setModal({type:'checkin'})
    }catch(err){setError(err.message)}
    finally{setBusy(false)}
  }

  async function findClients(){
    if(lookup.trim().length<2)return
    setBusy(true);setError('')
    try{
      const r=await comercialGet('/api/clientes?limit=15&q='+encodeURIComponent(lookup))
      setClients(r.clientes||[])
    }catch(err){setError(err.message)}
    finally{setBusy(false)}
  }

  async function checkin(e){
    e.preventDefault();setBusy(true);setError('')
    try{
      const r=await comercialPost('/api/agendamentos/'+found.id+'/checkin',{
        qr:scan,corretor_pessoa_id:Number(broker),
        segundo_corretor_pessoa_id:second?Number(second):null,
        atendente_pessoa_id:Number(attendant),
        cliente_id:clientId?Number(clientId):null,
      })
      setModal(null);setFound(null);setScan('')
      setNotice(r.message);await reload()
      navigate('atendimentos')
    }catch(err){setError(err.message)}
    finally{setBusy(false)}
  }

  async function cancel(id){
    if(!window.confirm('Cancelar este agendamento? O QR Code deixará de ser válido.'))return
    setBusy(true);setError('')
    try{const r=await comercialPost('/api/agendamentos/'+id+'/cancelar',{});setNotice(r.message);await reload()}
    catch(err){setError(err.message)}finally{setBusy(false)}
  }

  return <div className="agenda-page">
    <header className="agenda-heading">
      <div><small>OPERAÇÃO / CAPTAÇÃO</small><h1>Agendamentos</h1>
        <p>Converta visitas marcadas em comparecimentos e acompanhe os fechamentos.</p></div>
      <button className="agenda-primary" onClick={()=>{setError('');setModal({type:'new'})}}>+ Agendar visita</button>
    </header>
    {notice&&<div role="status" className="agenda-feedback success">{notice}
      <button onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div role="alert" className="agenda-feedback error">{error}
      <button onClick={()=>setError('')}>Fechar</button></div>}

    <div className="agenda-metrics">
      {stats.map(([key,label])=><div className="agenda-metric" key={key}>
        <span>{label}</span><strong>{summary[key]??0}</strong></div>)}
      <div className="agenda-metric highlight"><span>Comparecimento</span><strong>{summary.taxa_comparecimento??0}%</strong></div>
      <div className="agenda-metric highlight"><span>Fechamento dos presentes</span><strong>{summary.taxa_fechamento??0}%</strong></div>
    </div>

    <section className="agenda-panel">
      <div className="agenda-headrow"><div><h2>Agenda e leads</h2><p>Consulte, entregue o convite ou faça o check-in com QR Code.</p></div>
        <button className="agenda-scan" onClick={()=>{setError('');setScan('');setModal({type:'scan'})}}>▣ Ler QR Code</button>
      </div>
      <input type="search" className="agenda-search" value={q} onChange={e=>setQ(e.target.value)}
        placeholder="Buscar por nome, telefone ou número do agendamento..." />
      {loading?<p className="agenda-empty">Carregando agendamentos...</p>:rows.length===0?
        <div className="agenda-empty">Nenhum agendamento localizado. Comece cadastrando uma visita.</div>:
        <div className="agenda-list">{rows.map(a=><article key={a.id} className="agenda-item">
          <div className="agenda-avatar">{a.nome_completo?.slice(0,1)?.toUpperCase()}</div>
          <div className="agenda-main">
            <div className="agenda-title"><strong>{a.nome_completo}</strong><span>#{a.id}</span></div>
            <small>{formatPhone(a.telefone)} · {fmt(a.data_visita)} · {a.quantidade_pessoas} pessoa(s)</small>
            <p>Captado por <b>{a.captador_nome}</b>
              {a.corretor_confirmado_nome&&<span> · Recepção: {a.corretor_confirmado_nome}</span>}</p>
          </div>
          <span className={'agenda-status '+a.situacao.toLowerCase()}>
            {a.situacao==='COMPARECEU'?'Compareceu':a.situacao==='CANCELADO'?'Cancelado':a.data_visita<localDateISO()?'Não compareceu':'Agendado'}
          </span>
          <div className="agenda-actions">
            <button disabled={busy} onClick={()=>baixarConvite(a).catch(e=>setError(e.message))}>Convite PNG</button>
            {a.situacao==='AGENDADO'&&<>
              <button className="accent" onClick={()=>inspect('SPLASH:AG:1:'+a.qr_token)}>Check-in</button>
              <button disabled={busy} onClick={()=>cancel(a.id)}>Cancelar</button>
            </>}
            {a.visita_id&&<button onClick={()=>navigate('atendimentos')}>Ver visitas</button>}
          </div>
        </article>)}</div>}
    </section>

    {modal?.type==='new'&&<SurfaceModal title="Novo agendamento" subtitle="O convite com QR Code será gerado ao salvar."
      busy={busy} onClose={()=>setModal(null)}>
      <form className="agenda-form" onSubmit={create}>
        <label>Nome completo *<input required maxLength={160} value={form.nome_completo} onChange={e=>set('nome_completo',e.target.value)} /></label>
        <label>WhatsApp / telefone com DDD *<input required inputMode="tel" value={formatPhone(form.telefone)} onChange={e=>set('telefone',cleanPhone(e.target.value))} /></label>
        <div className="agenda-cols">
          <label>Data da visita *<input required type="date" min={localDateISO()} value={form.data_visita} onChange={e=>set('data_visita',e.target.value)} /></label>
          <label>Nº de pessoas *<input required type="number" min="1" max="100" value={form.quantidade_pessoas} onChange={e=>set('quantidade_pessoas',e.target.value)} /></label>
        </div>
        <label>Corretor que captou *<select required value={form.captador_pessoa_id} onChange={e=>set('captador_pessoa_id',e.target.value)}>
          <option value="">Selecionar corretor</option>
          {brokers.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
        </select></label>
        <label>Observações (opcional)<textarea maxLength={500} value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} /></label>
        <div className="agenda-form-actions"><button type="button" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="agenda-primary" disabled={busy}>{busy?'Salvando...':'Salvar e gerar convite'}</button></div>
      </form>
    </SurfaceModal>}

    {modal?.type==='scan'&&<SurfaceModal title="Ler QR Code" subtitle="Use o leitor USB ou cole o conteúdo do QR Code."
      busy={busy} onClose={()=>setModal(null)}>
      <form className="agenda-form" onSubmit={e=>{e.preventDefault();inspect(scan)}}>
        <label>Código do agendamento<input autoFocus required value={scan} onChange={e=>setScan(e.target.value)}
          placeholder="Aponte o leitor ou cole o QR" /></label>
        <div className="agenda-form-actions"><button type="button" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="agenda-primary" disabled={busy}>Conferir código</button></div>
      </form>
    </SurfaceModal>}

    {modal?.type==='checkin'&&found&&<SurfaceModal title="Confirmar comparecimento" subtitle={'Agendamento nº '+found.id+' · '+found.nome_completo}
      busy={busy} onClose={()=>{setFound(null);setModal(null)}}>
      <form className="agenda-form" onSubmit={checkin}>
        <div className="agenda-booking-info">
          <strong>{found.nome_completo}</strong>
          <span>{formatPhone(found.telefone)} · {fmt(found.data_visita)} · {found.quantidade_pessoas} pessoa(s)</span>
          <small>Corretor que cadastrou: {found.captador_nome}</small>
        </div>
        {found.situacao!=='AGENDADO'?<p className="agenda-warning">Esse agendamento já foi utilizado ou cancelado.</p>:<>
          <p className="agenda-hint">Confirme o corretor que receberá o cliente. É possível manter quem cadastrou ou escolher outros dois participantes.</p>
          <label>Corretor responsável *<select required value={broker} onChange={e=>setBroker(e.target.value)}>
            <option value="">Selecionar</option>{brokers.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
          </select></label>
          <label>Segundo corretor (opcional)<select value={second} onChange={e=>setSecond(e.target.value)}>
            <option value="">Nenhum</option>{brokers.filter(p=>p.value!==broker).map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
          </select></label>
          <label>Quem vai atender? *<select required value={attendant} onChange={e=>setAttendant(e.target.value)}>
            <option value="">Selecionar atendente</option>{attendants.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
          </select></label>
          <div className="agenda-linkclient">
            <strong>Vincular cliente já cadastrado (opcional)</strong>
            <p>Se houver cliente com telefone igual, selecione-o antes do check-in para evitar duplicidade.</p>
            <div className="agenda-inline"><input value={lookup} onChange={e=>setLookup(e.target.value)} placeholder="Telefone ou nome" />
              <button type="button" disabled={busy} onClick={findClients}>Localizar</button></div>
            <select value={clientId} onChange={e=>setClientId(e.target.value)}>
              <option value="">Cadastrar ou localizar automaticamente</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.nome} · {formatPhone(c.telefone)}</option>)}
            </select>
          </div>
          <div className="agenda-form-actions"><button type="button" onClick={()=>setModal(null)}>Voltar</button>
            <button className="agenda-primary" disabled={busy||!broker||!attendant||second===broker}>
              {busy?'Confirmando...':'Confirmar e iniciar atendimento'}</button></div>
        </>}
      </form>
    </SurfaceModal>}
  </div>
}
