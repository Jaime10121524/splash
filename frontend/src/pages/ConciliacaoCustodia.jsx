import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import PixVendaCustodia from './PixVendaCustodia.jsx'
import './ConciliacaoCustodia.css'

const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0))
const amountText=value=>Number(value)>0?Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''
const toDecimal=raw=>{
  const value=String(raw??'').trim()
  const number=value.includes(',')?value.replace(/\./g,'').replace(',','.'):value
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(number)&&Number(number)>0?number:null
}
const newKey=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'_'+Math.random().toString(36).slice(2,13)
const tipos=[
  {value:'SALDO_ANTERIOR',label:'Saldo anterior informado'},
  {value:'PIX_RETIDO',label:'Pix / dinheiro do clube retido anteriormente'},
  {value:'REPASSE_CLUBE',label:'Dinheiro devolvido ao clube'},
]
const typeName=value=>tipos.find(t=>t.value===value)?.label||value

export default function ConciliacaoCustodia({fechamentoId}){
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [modal,setModal]=useState(null)
  const [form,setForm]=useState({tipo:'',valor:'',data_movimento:localDateISO(),referencia:'',observacoes:''})
  const [reason,setReason]=useState('')
  const [nonce,setNonce]=useState(newKey)

  async function refresh(){
    const response=await comercialGet('/api/fechamentos-periodos/'+fechamentoId+'/conciliacao')
    setData(response.conciliacao)
  }
  useEffect(()=>{
    let active=true
    setLoading(true);setError('');setData(null)
    comercialGet('/api/fechamentos-periodos/'+fechamentoId+'/conciliacao')
      .then(result=>{if(active)setData(result.conciliacao)})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[fechamentoId])

  function newMovement(tipo){
    const saldo=data?.saldos?.saldo_conciliado
    setForm({tipo,valor:tipo==='REPASSE_CLUBE'?amountText(Math.max(0,Number(saldo))):'',
      data_movimento:localDateISO(),referencia:'',observacoes:''})
    setNonce(newKey());setError('');setModal({kind:'movement'})
  }
  function reverse(item){
    setReason('');setError('');setModal({kind:'reverse',item})
  }
  async function save(e){
    e.preventDefault()
    const valor=toDecimal(form.valor)
    if(!valor)return setError('Informe um valor positivo.')
    if(form.referencia.trim().length<3 || form.observacoes.trim().length<10){
      return setError('Informe a referência do comprovante e uma descrição de pelo menos dez caracteres.')
    }
    setBusy(true);setError('')
    try{
      const answer=await comercialPost('/api/fechamentos-periodos/'+fechamentoId+'/conciliacao/movimentos',{
        ...form,valor,referencia:form.referencia.trim(),observacoes:form.observacoes.trim(),
        chave_requisicao:nonce,
      })
      await refresh()
      setNotice(answer.message);setModal(null)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function undo(e){
    e.preventDefault()
    if(reason.trim().length<10)return setError('Justifique o estorno em pelo menos dez caracteres.')
    setBusy(true);setError('')
    try{
      const answer=await comercialPost('/api/fechamentos-periodos/'+fechamentoId+
        '/conciliacao/movimentos/'+modal.item.id+'/estornar',{justificativa:reason.trim()})
      await refresh()
      setNotice(answer.message);setModal(null)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }

  const balances=data?.saldos||{}
  const isNegative=Number(balances.saldo_conciliado)<0
  const hasBalance=Number(balances.saldo_conciliado)>0
  return <section className="com-panel cust-root" aria-label="Conciliação de custódia">
    <div className="com-panel-head">
      <div><h2>Conferência opcional de caixa</h2>
        <p>Confira dinheiro que ficou na conta de {data?.responsavel_nome||'seu grupo'}. Esta conferência é independente das quatro etapas do fechamento.</p></div>
    </div>
    <div className="cust-content">
      <p className="cust-intro">Este controle é útil somente quando você precisa acompanhar valores recebidos do clube que ainda estão sob sua guarda ou identificar Pix antigos. Exemplo: recebeu R$ 2.000, pagou R$ 1.500 aos participantes e ainda guarda R$ 500. Não é seu lucro, não quita automaticamente a comissão da Marta e não é obrigatório preencher nada.</p>
      {loading&&<div className="com-empty">Carregando conciliação...</div>}
      {error&&<p role="alert" className="com-alert error">{error}</p>}
      {notice&&<p role="status" className="com-alert success">{notice}</p>}
      {!loading&&data&&<>
        <div className="cust-metrics">
          <div><span>Recebido do clube</span><strong>{money(balances.recebido_clube)}</strong></div>
          <div><span>Saldo anterior informado</span><strong>{money(balances.saldo_anterior_informado)}</strong></div>
          <div><span>Pix / dinheiro retido confirmado</span><strong>{money(balances.pix_retido_informado)}</strong></div>
          <div><span>Pagamentos realizados</span><strong>{money(balances.pagamentos_confirmados)}</strong></div>
          <div><span>Devolvido ao clube</span><strong>{money(balances.devolvido_clube)}</strong></div>
          <div className="cust-total"><span>{isNegative?'Diferença a esclarecer':'Saldo apurado sob custódia'}</span>
            <strong>{money(balances.saldo_conciliado)}</strong></div>
        </div>
        {isNegative&&<p className="com-alert">Há mais pagamentos registrados que entradas documentadas. Verifique saldo anterior e dinheiro recebido fora deste fechamento. Nenhuma entrada foi criada automaticamente.</p>}
        <div className="cust-actions">
          <button type="button" className="vd-outline" onClick={()=>newMovement('SALDO_ANTERIOR')}>+ Saldo anterior</button>
          <button type="button" className="vd-outline" onClick={()=>newMovement('PIX_RETIDO')}>+ Pix retido / custódia</button>
          <button type="button" className="cm-button primary" disabled={!hasBalance} onClick={()=>newMovement('REPASSE_CLUBE')}>+ Devolução ao clube</button>
        </div>
        <p className="cust-help">Não lance novamente o que já consta em “Recebido do clube” ou “Pagamentos realizados”. Despesas pessoais e abatimentos de empréstimos não diminuem automaticamente o dinheiro custodiado. O saldo anterior e o Pix retido só devem ser registrados quando realmente comprovados.</p>
        <PixVendaCustodia fechamentoId={fechamentoId} responsavelNome={data.responsavel_nome} onChanged={refresh}/>
        <h3>Histórico de conciliação</h3>
        {(data.movimentos||[]).length===0?<div className="com-empty">Ainda não há movimentos manuais de custódia.</div>:
          <div className="cust-entries">{data.movimentos.map(item=><article key={item.id}>
            <div className="cust-entry-main"><strong>{typeName(item.tipo)}</strong>
              <small>{dateBR(item.data_movimento)} · Ref.: {item.referencia}</small>
              <small>{item.observacoes}</small>
              {item.situacao==='ESTORNADO'&&<small>Estornado: {item.motivo_estorno}</small>}</div>
            <div className="cust-entry-end">
              <strong>{item.tipo==='REPASSE_CLUBE'?'−':'+'}{money(item.valor)}</strong>
              <small>{item.situacao==='ATIVO'?'Ativo':'Estornado'}</small>
              {item.situacao==='ATIVO'&&<button type="button" className="vd-outline" onClick={()=>reverse(item)}>Estornar</button>}
            </div>
          </article>)}</div>}
      </>}
    </div>
    {modal&&<SurfaceModal eyebrow="SPLASH / CONCILIAÇÃO"
      title={modal.kind==='reverse'?'Estornar movimento':'Registrar movimento em custódia'}
      busy={busy} onClose={()=>!busy&&setModal(null)}>
      {modal.kind==='movement'&&<form className="fpw-modal-form" onSubmit={save}>
        <p className="cust-help">Isto registra a movimentação de dinheiro do responsável, não uma nova comissão e nem baixa do pagamento a outro participante.</p>
        <label>Tipo * <FormControl type="select" value={form.tipo}
          onChange={v=>setForm(s=>({...s,tipo:v}))} options={tipos}/></label>
        <div className="fpw-two">
          <label>Valor (R$) * <input inputMode="decimal" required value={form.valor}
            onChange={e=>setForm(s=>({...s,valor:e.target.value}))}/></label>
          <label>Data * <FormControl type="date" value={form.data_movimento}
            onChange={v=>setForm(s=>({...s,data_movimento:v}))}/></label>
        </div>
        <label>Referência / comprovante * <input value={form.referencia} maxLength={100} required
          placeholder="Ex.: comprovante Pix, semana anterior" onChange={e=>setForm(s=>({...s,referencia:e.target.value}))}/></label>
        <label>Descrição do movimento * <textarea value={form.observacoes} required minLength={10}
          maxLength={500} rows={3} placeholder="Informe a origem ou destino e por que este valor está sob custódia."
          onChange={e=>setForm(s=>({...s,observacoes:e.target.value}))}/></label>
        <div className="fpw-actions"><button type="button" className="vd-outline" disabled={busy}
          onClick={()=>setModal(null)}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>{busy?'Salvando...':'Confirmar registro'}</button></div>
      </form>}
      {modal.kind==='reverse'&&<form className="fpw-modal-form" onSubmit={undo}>
        <p className="cust-help">{typeName(modal.item.tipo)} · {money(modal.item.valor)}. O registro continuará no histórico com o motivo do estorno.</p>
        <label>Justificativa do estorno * <textarea rows={3} required minLength={10}
          maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <div className="fpw-actions"><button className="vd-outline" type="button" disabled={busy}
          onClick={()=>setModal(null)}>Cancelar</button>
          <button className="cm-button primary" type="submit" disabled={busy}>Confirmar estorno</button></div>
      </form>}
      {error&&<p className="com-alert error" role="alert">{error}</p>}
    </SurfaceModal>}
  </section>
}
