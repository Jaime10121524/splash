import { useEffect, useState } from 'react'
import { ClientFields, ClientFinder, SurfaceModal, emptyClient } from '../components/ComercialForms.jsx'
import { FormControl } from '../components/UiFields.jsx'
import { comercialGet, comercialPost, dateBR, localDateISO, personOptions, timeSpan } from '../lib/comercialApi.js'
import './ComercialPages.css'
import { formatPhone } from '../components/PhoneInput.jsx'

const statusLabels={
  AGUARDANDO:'Aguardando', ATENDENDO:'Em atendimento',
  RETORNO:'Retorno agendado', SEM_VENDA:'Não fechou',
  PENDENCIA:'Pendência de negociação', VENDA:'Venda fechada',
}
const stateOptions=[
  {value:'RETORNO',label:'Retorno agendado'},
  {value:'SEM_VENDA',label:'Não fechou'},
  {value:'PENDENCIA',label:'Pendência de negociação (sem financeiro)'},
  {value:'VENDA',label:'Venda fechada (aguarda lançamento)'},
]
const initialStats={total:0,aguardando:0,atendendo:0,retorno:0,sem_venda:0,pendencia:0,venda:0,media_segundos:null,mais_rapido_segundos:null,mais_demorado_segundos:null}

export default function Atendimentos() {
  const [catalogs,setCatalogs]=useState({origens:[],motivos:[],pessoas:[]})
  const [visits,setVisits]=useState([])
  const [stats,setStats]=useState(initialStats)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [period,setPeriod]=useState('hoje')
  const [startDate,setStartDate]=useState(localDateISO())
  const [endDate,setEndDate]=useState(localDateISO())
  const [filterStatus,setFilterStatus]=useState('')
  const [modal,setModal]=useState(null)
  const [mode,setMode]=useState('existing')
  const [selectedClient,setSelectedClient]=useState(null)
  const [newClient,setNewClient]=useState(emptyClient())
  const [attendant,setAttendant]=useState('')
  const [broker,setBroker]=useState('')
  const [secondBroker,setSecondBroker]=useState('')
  const [additional,setAdditional]=useState('')
  const [outcome,setOutcome]=useState('RETORNO')
  const [returnDate,setReturnDate]=useState('')
  const [reason,setReason]=useState('')
  const [notes,setNotes]=useState('')
  const [formError,setFormError]=useState('')
  const [saving,setSaving]=useState(false)

  useEffect(()=>{comercialGet('/api/comercial/opcoes').then(setCatalogs).catch(e=>setError(e.message))},[])
  useEffect(()=>{
    let active=true
    setLoading(true)
    const params=new URLSearchParams()
    if(period==='hoje'){
      params.set('inicio',localDateISO())
      params.set('fim',localDateISO())
    }else if(period==='intervalo'){
      if(startDate)params.set('inicio',startDate)
      if(endDate)params.set('fim',endDate)
    }
    if(filterStatus)params.set('status',filterStatus)
    comercialGet('/api/atendimentos?'+params.toString())
      .then(body=>{if(active){setVisits(body.visitas||[]);setStats(body.indicadores||initialStats);setError('')}})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[period,startDate,endDate,filterStatus,notice])

  async function reload(){
    const params=new URLSearchParams()
    if(period==='hoje'){params.set('inicio',localDateISO());params.set('fim',localDateISO())}
    if(period==='intervalo'){if(startDate)params.set('inicio',startDate);if(endDate)params.set('fim',endDate)}
    if(filterStatus)params.set('status',filterStatus)
    const body=await comercialGet('/api/atendimentos?'+params.toString())
    setVisits(body.visitas||[]);setStats(body.indicadores||initialStats)
  }
  function openArrival(client=null,visit=null){
    setMode('existing');setSelectedClient(client)
    setBroker(visit?.corretor_pessoa_id?String(visit.corretor_pessoa_id):'')
    setSecondBroker(visit?.segundo_corretor_pessoa_id?String(visit.segundo_corretor_pessoa_id):'')
    setNewClient(emptyClient());setFormError('');setModal({type:'arrival'})
  }
  function openBrokers(visit,type='brokers'){
    setBroker(visit?.corretor_pessoa_id?String(visit.corretor_pessoa_id):'')
    setSecondBroker(visit?.segundo_corretor_pessoa_id?String(visit.segundo_corretor_pessoa_id):'')
    setFormError('');setModal({type,visit})
  }
  function openStart(visit){
    setAttendant(visit.atendente_pessoa_id?String(visit.atendente_pessoa_id):'')
    setAdditional(visit.atendente_adicional_pessoa_id?String(visit.atendente_adicional_pessoa_id):'')
    setFormError('');setModal({type:'start',visit})
  }
  function openFinish(visit){
    setOutcome('RETORNO');setReturnDate('');setReason('');setNotes('')
    setFormError('');setModal({type:'finish',visit})
  }
  async function submit(){
    setSaving(true);setFormError('')
    try{
      let result
      if(['arrival','brokers','resume'].includes(modal.type)){
        if(!broker)throw new Error('Selecione o corretor responsável.')
        if(secondBroker && secondBroker===broker)throw new Error('O segundo corretor deve ser diferente.')
      }
      const brokerPayload={corretor_pessoa_id:broker?Number(broker):null,
        segundo_corretor_pessoa_id:secondBroker?Number(secondBroker):null}
      if(modal.type==='arrival'){
        if(mode==='existing'){
          if(!selectedClient)throw new Error('Escolha um cliente existente.')
          result=await comercialPost('/api/atendimentos/chegada',{cliente_id:selectedClient.id,...brokerPayload})
        }else{
          result=await comercialPost('/api/atendimentos/chegada',{
            novo_cliente:{...newClient,ativo:true},...brokerPayload,
          })
        }
      }else if(modal.type==='brokers'){
        result=await comercialPost('/api/atendimentos/'+modal.visit.id+'/corretores',brokerPayload)
      }else if(modal.type==='resume'){
        result=await comercialPost('/api/atendimentos/'+modal.visit.id+'/retomar',brokerPayload)
      }else if(modal.type==='start'){
        if(!attendant)throw new Error('Escolha o atendente responsável.')
        result=await comercialPost('/api/atendimentos/'+modal.visit.id+'/iniciar',{
          atendente_pessoa_id:Number(attendant),
          atendente_adicional_pessoa_id:additional?Number(additional):null,
        })
      }else{
        result=await comercialPost('/api/atendimentos/'+modal.visit.id+'/finalizar',{
          status:outcome,
          motivo_nao_venda_id:outcome==='SEM_VENDA'?reason||null:null,
          retorno_previsto:outcome==='RETORNO'?returnDate||null:null,
          observacoes:notes,
        })
      }
      setNotice(result.message)
      setModal(null)
      await reload()
    }catch(e){setFormError(e.message)}
    finally{setSaving(false)}
  }
  const attOptions=personOptions(catalogs.pessoas,['vendedor','corretor'])
  const availableReasons=(catalogs.motivos||[]).filter(m=>m.ativo)
    .map(m=>({value:String(m.id),label:m.descricao}))
  const kpis=[
    ['Visitas',stats.total,'Registros do período'],
    ['Aguardando',stats.aguardando,'Ainda não iniciados'],
    ['Em atendimento',stats.atendendo,'Atendimento em andamento'],
    ['Finalizados',stats.retorno+stats.sem_venda+stats.pendencia+(stats.venda||0),'Resultado registrado'],
  ]

  return <div className="com-page">
    <header className="com-heading"><div><span className="com-eyebrow">OPERAÇÃO / VISITAS</span>
      <h1>Atendimentos</h1>
      <p>Da chegada ao resultado, com registro automático dos horários.</p></div>
      <button className="com-main-button" type="button" onClick={()=>openArrival()}>＋ Registrar chegada</button>
    </header>
    {notice&&<div className="com-alert success" role="status">{notice}<button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}<button type="button" onClick={()=>{setError('');reload().catch(e=>setError(e.message))}}>Tentar novamente</button></div>}
    <div className="com-stats">
      {kpis.map(([label,value,description])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{description}</small></article>)}
    </div>
    <div className="com-time-band"><div><span>Tempo médio</span><strong>{timeSpan(stats.media_segundos)}</strong></div>
      <div><span>Mais rápido</span><strong>{timeSpan(stats.mais_rapido_segundos)}</strong></div>
      <div><span>Mais demorado</span><strong>{timeSpan(stats.mais_demorado_segundos)}</strong></div></div>
    <section className="com-panel">
      <div className="com-panel-head"><div><h2>Registro de visitas</h2>
        <p>Os tempos são calculados entre iniciar e encerrar o atendimento.</p></div>
        <span className="com-count">Até 150 registros por consulta</span></div>
      <div className="com-filters">
        <div className="com-period-buttons">
          {[['hoje','Hoje'],['todos','Todas'],['intervalo','Período']].map(([value,label])=>
            <button key={value} type="button" className={period===value?'active':''} onClick={()=>setPeriod(value)}>{label}</button>)}
        </div>
        {period==='intervalo'&&<div className="com-date-filter">
          <FormControl type="date" value={startDate} onChange={setStartDate} ariaLabel="Data inicial"/>
          <FormControl type="date" value={endDate} onChange={setEndDate} ariaLabel="Data final"/></div>}
        <div className="com-filter-select"><FormControl type="select" value={filterStatus}
          onChange={setFilterStatus} ariaLabel="Status do atendimento" placeholder="Todos os status"
          options={[{value:'',label:'Todos os status'},
            {value:'AGUARDANDO',label:'Aguardando'},
            {value:'ATENDENDO',label:'Em atendimento'},
            ...stateOptions]}/></div>
      </div>
      {loading?<div className="com-empty">Carregando atendimentos...</div>:
        !visits.length?<div className="com-empty"><span>▣</span><strong>Nenhuma visita no período</strong>
          <p>Registre a chegada para iniciar o histórico de atendimentos.</p></div>:
        <div className="com-visit-list">
          {visits.map(v=>{
            const elapsed=v.inicio_em && v.fim_em ? Number(v.duracao_segundos) : null
            const canResume=['SEM_VENDA','RETORNO','PENDENCIA'].includes(v.status)
              && v.chegada_em?.slice(0,10)===localDateISO()
            return <article className="com-visit" key={v.id}>
              <div className="com-visit-main">
                <div className="com-visit-name"><strong>{v.cliente_nome}</strong>
                  <span className={'com-pill '+(v.status==='ATENDENDO'?'violet':v.status==='AGUARDANDO'?'muted':'good')}>
                    {statusLabels[v.status]||v.status}</span></div>
                <small>{formatPhone(v.cliente_telefone)} · Corrente: {v.dono_corrente_nome||'—'}</small>
                <div className="com-visit-meta">
                  <span>Chegada: <b>{dateBR(v.chegada_em,true)}</b></span>
                  <span>Início: <b>{dateBR(v.inicio_em,true)}</b></span>
                  <span>Fim: <b>{dateBR(v.fim_em,true)}</b></span>
                  <span>Duração: <b>{timeSpan(elapsed)}</b></span>
                </div>
                <div className="com-visit-meta">
                  <span>Corretor: <b>{v.corretor_nome||'Não informado'}{v.segundo_corretor_nome?' + '+v.segundo_corretor_nome:''}</b></span>
                  <span>Atendente: <b>{v.atendente_nome||'Não iniciado'}{v.adicional_nome?' + '+v.adicional_nome:''}</b></span>
                  {v.retorno_previsto&&<span>Volta prevista: <b>{dateBR(v.retorno_previsto)}</b></span>}
                  {v.motivo_nome&&<span>Motivo: <b>{v.motivo_nome}</b></span>}
                </div>
              </div>
              <div className="com-actions">
                <button type="button" onClick={()=>openBrokers(v)}>Corretores</button>
                {v.status==='AGUARDANDO'&&<button type="button" className="primary" onClick={()=>openStart(v)}>Iniciar atendimento</button>}
                {v.status==='ATENDENDO'&&<button type="button" className="primary" onClick={()=>openFinish(v)}>Encerrar atendimento</button>}
                {canResume&&<button type="button" className="primary"
                  onClick={()=>openBrokers(v,'resume')}>Retomar hoje</button>}
                {!['AGUARDANDO','ATENDENDO'].includes(v.status)&&!canResume&&<button type="button" onClick={()=>
                  openArrival({id:v.cliente_id,nome:v.cliente_nome,telefone:v.cliente_telefone},v)}>Nova visita</button>}
              </div>
            </article>
          })}
        </div>}
    </section>
    <p className="com-disclaimer">Pendências nesta tela são apenas resultados de atendimento. Recebimentos, comissões e vendas serão vinculados no módulo financeiro/comercial posterior.</p>

    {modal&&<SurfaceModal
      title={modal.type==='arrival'?'Registrar chegada':modal.type==='start'?'Iniciar atendimento':modal.type==='finish'?'Encerrar atendimento':modal.type==='resume'?'Retomar atendimento':'Corretores do atendimento'}
      subtitle={modal.type==='arrival'?'Registre o cliente assim que chegar ao clube.':modal.visit?.cliente_nome}
      onClose={()=>setModal(null)} busy={saving}>
      <div className="cm-form">
        {modal.type==='arrival'&&<>
          <div className="com-toggle"><button className={mode==='existing'?'active':''} onClick={()=>setMode('existing')}>Cliente existente</button>
            <button className={mode==='new'?'active':''} onClick={()=>setMode('new')}>Novo cliente</button></div>
          {mode==='existing'?<ClientFinder label="Cliente" value={selectedClient} onChange={setSelectedClient}/>:
            <ClientFields compact fields={newClient} onChange={setNewClient} catalogs={catalogs}/>}
          <div className="com-inform">A chegada será registrada com a hora do servidor. O cronômetro começa ao clicar em Iniciar atendimento.</div>
        </>}
        {['arrival','brokers','resume'].includes(modal.type)&&<>
          <label><span className="field-caption">Corretor responsável <em>*</em></span>
            <FormControl type="select" value={broker} onChange={setBroker}
              options={personOptions(catalogs.pessoas,['corretor'])}
              placeholder="Selecione o corretor" ariaLabel="Corretor responsável"/></label>
          <label>Segundo corretor (opcional)
            <FormControl type="select" value={secondBroker} onChange={setSecondBroker}
              options={[{value:'',label:'Nenhum'},...personOptions(catalogs.pessoas,['corretor']).filter(p=>p.value!==broker)]}
              placeholder="Nenhum" ariaLabel="Segundo corretor"/></label>
          <div className="com-inform">O corretor não precisa ser o dono da corrente nem o usuário que cadastrou a visita.</div>
        </>}
        {modal.type==='start'&&<>
          <label><span className="field-caption">Atendente principal <em>*</em></span>
            <FormControl type="select" value={attendant} onChange={setAttendant} options={attOptions}
              disabled={!!modal.visit.atendente_pessoa_id}
              placeholder="Escolha o atendente" ariaLabel="Atendente principal"/></label>
          <label>Segundo atendente (opcional)
            <FormControl type="select" value={additional} onChange={setAdditional}
              options={[{value:'',label:'Nenhum'},...attOptions]} ariaLabel="Segundo atendente"/></label>
          {modal.visit.atendente_pessoa_id&&<div className="com-inform">
            Este cliente já tem atendente atribuído em uma visita anterior. O sistema mantém o responsável no retorno.
          </div>}
        </>}
        {modal.type==='finish'&&<>
          <label><span className="field-caption">Resultado <em>*</em></span>
            <FormControl type="select" ariaLabel="Resultado do atendimento" value={outcome}
              onChange={setOutcome} options={stateOptions}/></label>
          {outcome==='RETORNO'&&<label><span className="field-caption">Data prevista de retorno <em>*</em></span>
            <FormControl type="date" ariaLabel="Retorno previsto" value={returnDate} onChange={setReturnDate}/></label>}
          {outcome==='SEM_VENDA'&&<label><span className="field-caption">Motivo de não venda <em>*</em></span>
            <FormControl type="select" ariaLabel="Motivo de não venda" value={reason} onChange={setReason}
              options={availableReasons} placeholder="Escolha o motivo"/></label>}
          <label>Observações<textarea rows={3} maxLength={3000} value={notes}
            onChange={e=>setNotes(e.target.value)} placeholder="Resultado do atendimento"/></label>
          {outcome==='VENDA'&&<div className="com-inform">
            O resultado comercial será registrado. O título e os valores serão informados posteriormente em Vendas, sem criar comissão automática agora.
          </div>}
          {outcome==='PENDENCIA'&&<div className="com-inform">
            A pendência comercial será registrada sem movimentar dinheiro. Entradas e comissões serão lançadas na etapa financeira.
          </div>}
        </>}
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button className="cm-button" disabled={saving}
          onClick={()=>setModal(null)}>Cancelar</button><button className="cm-button primary" disabled={saving}
          onClick={submit}>{saving?'Processando...':modal.type==='arrival'?'Registrar chegada':modal.type==='start'?'Iniciar':modal.type==='resume'?'Retomar':modal.type==='brokers'?'Salvar corretores':'Encerrar'}</button></div>
      </div>
    </SurfaceModal>}
  </div>
}
