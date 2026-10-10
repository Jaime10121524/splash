import { useEffect, useMemo, useState } from 'react'
import { ClientFinder, SurfaceModal } from '../components/ComercialForms.jsx'
import { FormControl } from '../components/UiFields.jsx'
import { comercialGet, comercialPost, dateBR, localDateISO, personOptions } from '../lib/comercialApi.js'
import { formatPhone } from '../components/PhoneInput.jsx'
import RateiosVenda from './RateiosVenda.jsx'
import './ComercialPages.css'
import './Vendas.css'

const currency = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const suggestedAmount = n => Number(n)>0?Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''
const moneyInput = value => {
  const s=String(value??'').trim()
  if(!s) return null
  const normalized=s.includes(',') ? s.replace(/\./g,'').replace(',','.') : s
  return /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(normalized) ? normalized : null
}
const states={PENDENCIA:'Pendência',VENDA:'Venda registrada'}
const blank=()=>({
  situacao:'VENDA',cliente_id:'',visita_id:'',plano_versao_id:'',
  desconto_corretor:'0,00',numero_titulo:'',
  data_negociacao:localDateISO(),data_venda:localDateISO(),data_inicio:localDateISO(),
  retorno_previsto:'',observacoes:'',historica:false,
  corretor_pessoa_id:'',segundo_corretor_pessoa_id:'',gerente_pessoa_id:'',atendente_pessoa_id:'',atendente_adicional_pessoa_id:'',justificativa:'',
})
const blankMovement=()=>({valor:'',forma_id:'',detentor:'CORRETOR',
  data_movimento:localDateISO(),observacoes:'',entrada_id:''})
const noop=()=>{}

export default function Vendas({tab='vendas',initialVisit=null,onVisitAccepted=noop,initialOperation=null,onOperationAccepted=noop,role='admin'}) {
  const [rows,setRows]=useState([])
  const [options,setOptions]=useState({planos:[],regras:[],formas:[],aplicacoes:[]})
  const [people,setPeople]=useState([])
  const [visits,setVisits]=useState([])
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [dialog,setDialog]=useState(null)
  const [client,setClient]=useState(null)
  const [linkedVisit,setLinkedVisit]=useState(null)
  const [saleForm,setSaleForm]=useState(blank)
  const [useDiscount,setUseDiscount]=useState(false)
  const [moveForm,setMoveForm]=useState(blankMovement)
  const [detail,setDetail]=useState(null)
  const [formError,setFormError]=useState('')
  const [setting,setSetting]=useState('regras')
  const [settingForm,setSettingForm]=useState(null)
  const [applying,setApplying]=useState({codigo:'',regra_comissao_id:''})
  const [adjustment,setAdjustment]=useState({valor:'',justificativa:''})
  const [showRateios,setShowRateios]=useState(false)

  async function loadOptions() {
    const [opt,catalogs,visitsResponse]=await Promise.all([
      comercialGet('/api/vendas/opcoes'),comercialGet('/api/comercial/opcoes'),
      comercialGet('/api/atendimentos'),
    ])
    setOptions(opt);setPeople(catalogs.pessoas||[]);setVisits(visitsResponse.visitas||[])
  }
  async function loadList(){
    const params=new URLSearchParams({situacao:tab==='pendencias'?'PENDENCIA':'VENDA',q:search})
    const result=await comercialGet('/api/vendas?'+params.toString())
    setRows(result.operacoes||[])
  }
  useEffect(()=>{
    if(role!=='admin')return
    let alive=true
    setLoading(true)
    Promise.all([loadOptions(),loadList()]).then(()=>{if(alive)setError('')})
      .catch(e=>{if(alive)setError(e.message)})
      .finally(()=>{if(alive)setLoading(false)})
    return ()=>{alive=false}
  },[role,tab,search])
  useEffect(()=>{
    if(!initialVisit?.id||role!=='admin')return
    const visit=initialVisit
    setLinkedVisit(visit)
    const form={...blank(),situacao:visit.status==='PENDENCIA'?'PENDENCIA':'VENDA',
      visita_id:String(visit.id),cliente_id:String(visit.cliente_id),
      corretor_pessoa_id:visit.corretor_pessoa_id?String(visit.corretor_pessoa_id):'',
      segundo_corretor_pessoa_id:visit.segundo_corretor_pessoa_id?String(visit.segundo_corretor_pessoa_id):'',
      atendente_pessoa_id:visit.atendente_pessoa_id?String(visit.atendente_pessoa_id):'',
      atendente_adicional_pessoa_id:visit.atendente_adicional_pessoa_id?String(visit.atendente_adicional_pessoa_id):'',
    }
    setSaleForm(form)
    setUseDiscount(false)
    setClient({id:visit.cliente_id,nome:visit.cliente_nome,telefone:visit.cliente_telefone})
    setFormError('');setDialog({type:'new'})
    onVisitAccepted()
  },[initialVisit?.id,role])

  useEffect(()=>{
    if(!initialOperation?.id||role!=='admin')return
    openDetail(initialOperation)
    onOperationAccepted()
  },[initialOperation?.id,role])

  const setField=(key,value)=>setSaleForm(f=>({...f,[key]:value}))
  const plan=options.planos.find(p=>String(p.id)===String(saleForm.plano_versao_id))
  const planChoices=options.planos.filter(p=>saleForm.historica||p.ativo).map(p=>({
    value:String(p.id),label:p.codigo+' · '+currency(p.valor)+' · '+(
      Number(p.duracao_meses)%12===0
        ? Number(p.duracao_meses)/12+' ano(s)'
        : Number(p.duracao_meses)+' mês(es)'
    )+(!p.ativo?' (histórico)':''),
  }))
  const brokerChoices=personOptions(people,['corretor'])
  const clientVisits=[...visits,
    ...(linkedVisit && !visits.some(v=>Number(v.id)===Number(linkedVisit.id))?[linkedVisit]:[])
  ].filter(v=>client && Number(v.cliente_id)===Number(client.id)
    && !v.operacao_id
    && (saleForm.situacao==='VENDA'?v.status==='VENDA':v.status==='PENDENCIA'))
  const currentMethod=options.formas.find(m=>String(m.id)===String(moveForm.forma_id))
  const entryRecords=(detail?.movimentos||[]).filter(r=>
    r.tipo==='ENTRADA' && Number(r.saldo_estornavel)>0)
  const selectedPlanTotal=plan?Number(plan.valor):0
  const discount=moneyInput(saleForm.desconto_corretor)
  const duePreview=discount!==null?selectedPlanTotal-Number(discount):null
  const viewOwn = role!=='admin'

  function openEdit(){
    if(!detail?.operacao) return
    const op=detail.operacao
    if(!detail.editavel) {
      setFormError('Para alterar condições da venda, primeiro estorne integralmente lançamentos incorretos. Devoluções reais e comissões ajustadas bloqueiam esta edição.')
      return
    }
    setClient({id:Number(op.cliente_id),nome:dialog.op?.cliente_nome||client?.nome||'Cliente vinculado',telefone:dialog.op?.cliente_telefone||''})
    setSaleForm({
      ...blank(),situacao:op.situacao,
      cliente_id:String(op.cliente_id),visita_id:op.visita_id?String(op.visita_id):'',
      plano_versao_id:String(op.plano_versao_id),
      historica:!!op.historica,numero_titulo:op.numero_titulo||'',
      corretor_pessoa_id:String(op.corretor_pessoa_id),
      segundo_corretor_pessoa_id:op.segundo_corretor_pessoa_id?String(op.segundo_corretor_pessoa_id):'',
      gerente_pessoa_id:op.gerente_pessoa_id?String(op.gerente_pessoa_id):'',
      atendente_pessoa_id:op.atendente_pessoa_id?String(op.atendente_pessoa_id):'',
      atendente_adicional_pessoa_id:op.atendente_adicional_pessoa_id?String(op.atendente_adicional_pessoa_id):'',
      desconto_corretor:Number(op.desconto_corretor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),
      data_negociacao:op.data_negociacao||localDateISO(),
      data_venda:op.data_venda||localDateISO(),
      data_inicio:op.data_inicio||localDateISO(),
      retorno_previsto:op.retorno_previsto||'',
      observacoes:op.observacoes||'',
      justificativa:'',
    })
    setUseDiscount(Number(op.desconto_corretor)>0)
    setFormError('')
    setDialog({type:'edit',op:dialog.op})
  }
  function openNew(kind=tab==='pendencias'?'PENDENCIA':'VENDA') {
    setSaleForm({...blank(),situacao:kind})
    setUseDiscount(false)
    setClient(null);setLinkedVisit(null);setDetail(null);setFormError('');setDialog({type:'new'})
  }
  async function openDetail(op,type='details'){
    setShowRateios(false)
    setBusy(true);setFormError('')
    try{
      const data=await comercialGet('/api/vendas/'+op.id)
      setDetail(data)
      setMoveForm(blankMovement())
      setDialog({type,op})
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function refresh(){
    await loadList()
    await loadOptions()
  }
  async function saveSale(event) {
    event.preventDefault()
    setFormError('')
    if(!client?.id) return setFormError('Selecione o cliente.')
    if(!saleForm.plano_versao_id)return setFormError('Escolha o plano vendido.')
    if(!saleForm.corretor_pessoa_id)return setFormError('Informe o corretor responsável.')
    const parsed=moneyInput(saleForm.desconto_corretor)
    if(parsed===null)return setFormError('Informe desconto válido (ex.: 100,00).')
    if(dialog.type==='edit' && saleForm.justificativa.trim().length<5)
      return setFormError('Informe o motivo da correção (mínimo cinco caracteres).')
    if(saleForm.situacao==='VENDA'&&!/^\d{4}$/.test(saleForm.numero_titulo))
      return setFormError('O número do título precisa ter exatamente quatro algarismos.')
    setBusy(true)
    try{
      const payload={
        ...saleForm,
        cliente_id:Number(client.id),plano_versao_id:Number(saleForm.plano_versao_id),
        visita_id:saleForm.visita_id?Number(saleForm.visita_id):null,
        corretor_pessoa_id:saleForm.corretor_pessoa_id?Number(saleForm.corretor_pessoa_id):null,
        segundo_corretor_pessoa_id:saleForm.segundo_corretor_pessoa_id?Number(saleForm.segundo_corretor_pessoa_id):null,
        gerente_pessoa_id:saleForm.gerente_pessoa_id?Number(saleForm.gerente_pessoa_id):null,
        atendente_pessoa_id:saleForm.atendente_pessoa_id?Number(saleForm.atendente_pessoa_id):null,
        atendente_adicional_pessoa_id:saleForm.atendente_adicional_pessoa_id?Number(saleForm.atendente_adicional_pessoa_id):null,
        desconto_corretor:parsed,
        retorno_previsto:saleForm.retorno_previsto||null,
      }
      const editing=dialog.type==='edit'
      const op=dialog.op
      const result=await comercialPost(editing?'/api/vendas/'+op.id+'/editar':'/api/vendas',payload)
      setDialog(null);setNotice(result.message)
      await refresh()
      await openDetail(editing?op:{id:result.operacao_id})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  async function saveConverter(e) {
    e.preventDefault()
    setBusy(true);setFormError('')
    if(!/^\d{4}$/.test(saleForm.numero_titulo)){
      setBusy(false);return setFormError('Informe os quatro dígitos do título.')
    }
    try{
      const result=await comercialPost('/api/vendas/'+dialog.op.id+'/converter',{
        numero_titulo:saleForm.numero_titulo,
        data_venda:saleForm.data_venda,data_inicio:saleForm.data_inicio,
      })
      setDialog(null);setNotice(result.message);await refresh()
      await openDetail(dialog.op)
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  function openConvert(op){
    setSaleForm({...blank(),data_venda:localDateISO(),data_inicio:localDateISO()})
    setFormError('');setDialog({type:'convert',op})
  }
  function openAdjustment(){
    const op=detail?.operacao
    const current=op?.comissao_ajustada??op?.comissao_prevista??''
    setAdjustment({valor:current===''?'':Number(current).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),
      justificativa:''})
    setFormError('')
    setDialog({type:'adjust',op:dialog.op})
  }
  async function saveAdjustment(e){
    e.preventDefault()
    const parsed=moneyInput(adjustment.valor)
    if(parsed===null||!adjustment.justificativa.trim())return setFormError('Informe a comissão e a justificativa.')
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/vendas/'+dialog.op.id+'/ajustar-comissao',{
        valor:parsed,justificativa:adjustment.justificativa.trim(),
      })
      setNotice(result.message)
      await refresh()
      const data=await comercialGet('/api/vendas/'+dialog.op.id)
      setDetail(data)
      setDialog({type:'details',op:dialog.op})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  async function saveMovement(e) {
    e.preventDefault()
    const parsed=dialog.type==='reversal'?null:moneyInput(moveForm.valor)
    if(dialog.type!=='reversal' && (parsed===null||Number(parsed)<=0))
      return setFormError('Informe valor positivo (ex.: 200,00).')
    if(dialog.type==='receipt'&&!moveForm.forma_id)return setFormError('Selecione a forma de pagamento.')
    if(['refund','reversal'].includes(dialog.type)&&!moveForm.entrada_id)
      return setFormError('Escolha o recebimento original.')
    if(['refund','reversal'].includes(dialog.type)&&moveForm.observacoes.trim().length<5)
      return setFormError('Informe a justificativa (mínimo cinco caracteres).')
    setBusy(true);setFormError('')
    try{
      const url='/api/vendas/'+dialog.op.id+(
        dialog.type==='refund'?'/devolver':dialog.type==='reversal'?'/estornar':'/receber')
      const payload=dialog.type==='reversal'
        ? {entrada_id:Number(moveForm.entrada_id),justificativa:moveForm.observacoes}
        : {valor:parsed,data_movimento:moveForm.data_movimento,
           observacoes:moveForm.observacoes,
           ...(dialog.type==='refund'
             ? {entrada_id:Number(moveForm.entrada_id)}
             : {forma_id:Number(moveForm.forma_id),detentor:moveForm.detentor})}
      const result=await comercialPost(url,payload)
      setNotice(result.message)
      await refresh()
      const next=await comercialGet('/api/vendas/'+dialog.op.id)
      setDetail(next);setMoveForm(blankMovement())
      setDialog({type:'details',op:dialog.op})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  function openApplication(item){
    setApplying({codigo:item.codigo,regra_comissao_id:String(item.regra_comissao_id)})
    setDialog({type:'application'});setFormError('')
  }
  async function saveApplication(event){
    event.preventDefault()
    setBusy(true);setFormError('')
    try{
      const result=await comercialPost('/api/vendas/aplicacoes/'+applying.codigo,{
        regra_comissao_id:Number(applying.regra_comissao_id),
      })
      setNotice(result.message)
      await refresh()
      setDialog({type:'settings'})
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  function openSetting(item=null) {
    const isRule=setting==='regras'
    setSettingForm(isRule?
      {id:item?.id||null,nome:item?.nome||'',modalidade:item?.modalidade||'AVISTA',
        numerador:String(item?.numerador||1),denominador:String(item?.denominador||3),
        desconto_cartao:String(item?.desconto_cartao??0),ativo:item?!!item.ativo:true}:
      {id:item?.id||null,nome:item?.nome||'',codigo:item?.codigo||'',
        credito:!!item?.credito,ativo:item?!!item.ativo:true})
    setDialog({type:'setting'});setFormError('')
  }
  async function saveSetting(e){
    e.preventDefault()
    setBusy(true);setFormError('')
    try{
      const folder=setting==='regras'?'regras':'formas'
      const url='/api/vendas/'+folder+(settingForm.id?'/'+settingForm.id+'/editar':'')
      const result=await comercialPost(url,settingForm)
      setDialog(null);setNotice(result.message);await refresh()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  if(viewOwn) return <section className="com-panel"><div className="com-empty">
    <strong>Consulta individual em preparação</strong>
    <p>Os valores de outros corretores não serão exibidos. A consulta individual será liberada junto ao fechamento e à apuração das comissões.</p>
  </div></section>

  return <div className="com-page vd-page">
    <header className="com-heading"><div><span className="com-eyebrow">COMERCIAL / {tab==='pendencias'?'PENDÊNCIAS':'VENDAS'}</span>
      <h1>{tab==='pendencias'?'Pendências':'Vendas'}</h1>
      <p>{tab==='pendencias'?'Negociações com pagamentos e retorno, antes da emissão do título.':'Títulos vendidos, recebimentos, saldos e histórico preservado.'}</p>
    </div>
      <div className="vd-header-actions">
        <button className="vd-outline" type="button" onClick={()=>{setFormError('');setDialog({type:'settings'})}}>Configurações</button>
        <button className="com-main-button" type="button" onClick={()=>openNew()}>＋ {tab==='pendencias'?'Nova pendência':'Nova venda'}</button>
      </div>
    </header>
    {notice&&<div className="com-alert success" role="status">{notice}<button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}<button type="button" onClick={()=>{setError('');refresh().catch(e=>setError(e.message))}}>Tentar novamente</button></div>}
    <section className="com-panel">
      <div className="com-panel-head"><div><h2>{tab==='pendencias'?'Negociações em aberto':'Vendas cadastradas'}</h2>
        <p>Histórico financeiro por operação, sem duplicação quando a pendência é fechada.</p></div>
        <span className="com-count">{rows.length} na consulta</span></div>
      <div className="com-toolbar"><input type="search" value={search}
        onChange={e=>setSearch(e.target.value)} aria-label="Pesquisar"
        placeholder="Pesquisar por cliente ou número do título..."/></div>
      {loading?<div className="com-empty">Carregando dados...</div>:
      rows.length===0?<div className="com-empty"><span>▢</span><strong>Nenhuma operação encontrada</strong>
        <p>Cadastre uma venda ou pendência para começar.</p></div>:
      <div className="vd-operations">{rows.map(op=><article key={op.id} className="vd-operation">
        <div className="vd-op-main">
          <div className="vd-op-line">
            <strong>{op.cliente_nome}</strong>
            <span className={'com-pill '+(op.situacao==='VENDA'?'good':'muted')}>{states[op.situacao]}</span>
          </div>
          <small>{formatPhone(op.cliente_telefone)} · {op.numero_titulo?op.numero_titulo+' ':''}{op.sigla_plano}
            {' · '}Corretor: {op.corretor_nome}{op.segundo_corretor_nome?' + '+op.segundo_corretor_nome:''}</small>
          <small>Corrente: {op.dono_corrente_nome} · {dateBR(op.data_venda||op.data_negociacao)}</small>
          {op.observacao_comissao&&<span className="vd-soft-note">{op.observacao_comissao}</span>}
        </div>
        <div className="vd-values"><span>Plano {currency(op.valor_cobrado)}</span>
          <strong>Recebido {currency(op.recebido)}</strong><small>Saldo {currency(op.saldo)}</small>
          <small>{op.comissao_ajustada!==null?'Comissão ajustada: '+currency(op.comissao_ajustada):'Comissão estimada: '+(op.comissao_prevista===null?'Após quitação':currency(op.comissao_prevista))}</small></div>
        <div className="com-actions"><button type="button" onClick={()=>openDetail(op)}>Extrato</button>
          {op.situacao==='PENDENCIA'&&<button type="button" className="primary" onClick={()=>openConvert(op)}>Fechar venda</button>}
        </div>
      </article>)}</div>}
    </section>
    <p className="com-disclaimer">Comissão prevista não é comissão paga. O repasse aos corretores, atendentes e gerentes e a compensação de empréstimos entram na etapa de fechamentos.</p>

    {dialog&&<SurfaceModal
      title={dialog.type==='new'?(saleForm.situacao==='PENDENCIA'?'Nova pendência':'Nova venda'):
        dialog.type==='convert'?'Fechar pendência em venda':
        dialog.type==='receipt'?'Registrar recebimento':dialog.type==='refund'?'Devolver dinheiro':
        dialog.type==='reversal'?'Estornar lançamento':dialog.type==='edit'?'Corrigir cadastro':
        dialog.type==='details'?'Extrato da operação':dialog.type==='adjust'?'Ajustar comissão':dialog.type==='setting'?'Cadastro financeiro':dialog.type==='application'?'Regra automática':'Configurações de vendas'}
      subtitle={['details','receipt','refund','reversal','edit'].includes(dialog.type)?dialog.op?.cliente_nome:''}
      busy={busy} onClose={()=>setDialog(null)}>

      {['new','edit'].includes(dialog.type)&&<form className="cm-form vd-form" onSubmit={saveSale}>
        {dialog.type==='edit'&&<div className="com-inform">
          É possível corrigir os dados antes de movimentar dinheiro ou após estornar integralmente um lançamento errado. A alteração ficará na auditoria. Devolução é só para dinheiro realmente devolvido.
        </div>}
        {dialog.type==='new'&&<label>Situação inicial
          <FormControl type="select" value={saleForm.situacao} onChange={v=>setSaleForm(f=>({...f,situacao:v,visita_id:'',atendente_pessoa_id:'',atendente_adicional_pessoa_id:''}))}
            options={[{value:'VENDA',label:'Venda fechada'},{value:'PENDENCIA',label:'Pendência de negociação'}]}/></label>}
        {dialog.type==='new'?<ClientFinder label="Cliente" value={client} onChange={selected=>{
          setClient(selected);setField('cliente_id',selected?.id||'');setField('visita_id','')
        }}/>:<div className="vd-readonly">Cliente: {client?.nome||'Cliente vinculado'} (não alterável)</div>}
        {dialog.type==='new'&&<label>Atendimento disponível (opcional)
          <FormControl type="select" value={saleForm.visita_id} onChange={value=>{
            const picked=clientVisits.find(v=>String(v.id)===value)
            setSaleForm(f=>({...f,visita_id:value,
              corretor_pessoa_id:picked?.corretor_pessoa_id?String(picked.corretor_pessoa_id):f.corretor_pessoa_id,
              segundo_corretor_pessoa_id:picked?.segundo_corretor_pessoa_id?String(picked.segundo_corretor_pessoa_id):f.segundo_corretor_pessoa_id,
              atendente_pessoa_id:picked?.atendente_pessoa_id?String(picked.atendente_pessoa_id):'',
              atendente_adicional_pessoa_id:picked?.atendente_adicional_pessoa_id?String(picked.atendente_adicional_pessoa_id):'',
            }))
          }} options={[{value:'',label:'Sem vínculo direto'},...clientVisits.map(v=>({
            value:String(v.id),label:'#'+v.id+' · '+dateBR(v.chegada_em,true)+' · '+(v.status==='VENDA'?'Venda':'Pendência')
          }))]}/></label>}
        <label className="cm-status-switch"><span><strong>Cadastro histórico</strong>
          <small>Permite escolher versões antigas de planos e regras.</small></span>
          <input type="checkbox" checked={saleForm.historica} disabled={dialog.type==='edit'} onChange={e=>setField('historica',e.target.checked)}/></label>
        <label><span className="field-caption">Plano e versão <em>*</em></span>
          <FormControl type="select" value={saleForm.plano_versao_id}
            onChange={v=>setField('plano_versao_id',v)} options={planChoices}
            placeholder="Selecione o plano vendido"/></label>
        <div className="com-inform">
          <strong>Comissão calculada automaticamente.</strong> Não é necessário selecionar regra. O sistema identifica à vista, cartão ou misto quando o cliente quitar o título. {saleForm.historica?'Nesta venda histórica, pagamento à vista utiliza o modelo antigo de 1/3.':'À vista atual utiliza o percentual configurado (inicialmente 40%).'}
        </div>
        <div className="cm-form-grid">
          <label><span className="field-caption">Corretor principal <em>*</em></span>
            <FormControl type="select" value={saleForm.corretor_pessoa_id}
              disabled={!!saleForm.visita_id && !!visits.find(v=>String(v.id)===saleForm.visita_id)?.corretor_pessoa_id}
              onChange={v=>setField('corretor_pessoa_id',v)} options={brokerChoices}
              placeholder="Selecione o corretor"/></label>
          <label>Segundo corretor
            <FormControl type="select" value={saleForm.segundo_corretor_pessoa_id}
              disabled={!!saleForm.visita_id}
              onChange={v=>setField('segundo_corretor_pessoa_id',v)}
              options={[{value:'',label:'Nenhum'},...brokerChoices.filter(x=>x.value!==saleForm.corretor_pessoa_id)]}/></label>
        </div>
        <div className="cm-form-grid">
          <label>Atendente
            <FormControl type="select" value={saleForm.atendente_pessoa_id}
              disabled={!!saleForm.visita_id}
              onChange={v=>setSaleForm(f=>({...f,atendente_pessoa_id:v,atendente_adicional_pessoa_id:''}))}
              options={[{value:'',label:'Sem atendente'},...personOptions(people,['vendedor','corretor'])]}/></label>
          <label>Segundo atendente
            <FormControl type="select" value={saleForm.atendente_adicional_pessoa_id}
              disabled={!!saleForm.visita_id||!saleForm.atendente_pessoa_id}
              onChange={v=>setField('atendente_adicional_pessoa_id',v)}
              options={[{value:'',label:'Nenhum'},...personOptions(people,['vendedor','corretor']).filter(x=>x.value!==saleForm.atendente_pessoa_id)]}/></label>
        </div>
        <label>Gerente responsável (opcional)
          <FormControl type="select" value={saleForm.gerente_pessoa_id}
            onChange={v=>setField('gerente_pessoa_id',v)}
            options={[{value:'',label:'Sem gerente'},...personOptions(people,['gerente'])]}/></label>
        <div className="cm-form-grid">
          <label>Valor de tabela
            <div className="vd-readonly">{currency(selectedPlanTotal)}</div></label>
          <div className="vd-discount-area">
            <label className="vd-discount-check">
              <input type="checkbox" checked={useDiscount} onChange={e=>{
                setUseDiscount(e.target.checked)
                if(!e.target.checked)setField('desconto_corretor','0,00')
              }}/>
              Conceder desconto ao cliente
            </label>
            {useDiscount&&<label>Valor do desconto
            <div className="vd-money-control">
              <span className="vd-money-prefix" aria-hidden="true">R$</span>
              <input type="text" inputMode="decimal" aria-label="Valor do desconto concedido ao cliente"
                value={saleForm.desconto_corretor}
                onFocus={e=>e.target.select()}
                onChange={e=>setField('desconto_corretor',e.target.value.replace(/[^0-9,.]/g,''))}
                onBlur={()=>{
                  const parsed=moneyInput(saleForm.desconto_corretor)
                  if(parsed!==null)setField('desconto_corretor',Number(parsed).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}))
                }}
                placeholder="0,00"/>
            </div>
            <small className="vd-field-help">O desconto sai integralmente da comissão do corretor, não da parte do clube.</small>
          </label>}
          </div>
        </div>
        <div className="vd-summary-line">Valor cobrado do cliente <strong>{duePreview!==null&&duePreview>=0?currency(duePreview):'Inválido'}</strong></div>
        <label>Data da negociação <FormControl type="date" value={saleForm.data_negociacao}
          onChange={v=>setField('data_negociacao',v)}/></label>
        {saleForm.situacao==='VENDA'?<>
          <label><span className="field-caption">Número individual do título <em>*</em></span>
            <input type="text" inputMode="numeric" maxLength={4} placeholder="Ex.: 1567"
              value={saleForm.numero_titulo} onChange={e=>setField('numero_titulo',e.target.value.replace(/\D/g,'').slice(0,4))}/>
            <small>{plan?'Título: '+(saleForm.numero_titulo||'____')+' '+plan.codigo:'Selecione o plano para identificar a sigla.'}</small></label>
          <div className="cm-form-grid">
            <label>Data da venda <FormControl type="date" value={saleForm.data_venda}
              onChange={v=>setField('data_venda',v)}/></label>
            <label>Início da vigência <FormControl type="date" value={saleForm.data_inicio}
              onChange={v=>setField('data_inicio',v)}/></label>
          </div>
        </>:<label>Retorno previsto <FormControl type="date" value={saleForm.retorno_previsto}
          onChange={v=>setField('retorno_previsto',v)}/></label>}
        <label>Observações<textarea rows={2} value={saleForm.observacoes}
          onChange={e=>setField('observacoes',e.target.value)} maxLength={4000}/></label>
        {dialog.type==='edit'&&<label><span className="field-caption">Motivo da correção <em>*</em></span>
          <textarea rows={2} maxLength={500} value={saleForm.justificativa}
            placeholder="Ex.: Selecionei o plano errado"
            onChange={e=>setField('justificativa',e.target.value)}/></label>}
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog(null)} disabled={busy}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>{busy?'Salvando...':dialog.type==='edit'?'Salvar correção':'Salvar operação'}</button></div>
      </form>}

      {dialog.type==='convert'&&<form className="cm-form" onSubmit={saveConverter}>
        <div className="com-inform">Os recebimentos e devoluções da pendência continuarão no mesmo extrato. Não haverá duplicação do valor.</div>
        <label><span className="field-caption">Número do título <em>*</em></span><input type="text" inputMode="numeric" maxLength={4}
          value={saleForm.numero_titulo} onChange={e=>setField('numero_titulo',e.target.value.replace(/\D/g,'').slice(0,4))}
          placeholder="Ex.: 1567"/></label>
        <div className="cm-form-grid">
          <label>Data da venda <FormControl type="date" value={saleForm.data_venda}
            onChange={v=>setField('data_venda',v)}/></label>
          <label>Início da vigência <FormControl type="date" value={saleForm.data_inicio}
            onChange={v=>setField('data_inicio',v)}/></label>
        </div>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog(null)} disabled={busy}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>{busy?'Salvando...':'Fechar venda'}</button></div>
      </form>}

      {dialog.type==='details'&&detail&&<div className="cm-form">
        <div className="vd-overview"><div><span>Preço cobrado pelo título</span><strong>{currency(detail.operacao.valor_cobrado)}</strong></div>
          <div><span>Cliente já pagou</span><strong>{currency(detail.recebido)}</strong></div>
          <div><span>Falta o cliente pagar</span><strong>{currency(detail.saldo)}</strong></div></div>
        <div className="com-inform">Esses três valores mostram pagamentos do CLIENTE pelo título, não o que o clube deve de comissão ao corretor.</div>
        <div className="vd-detail-title"><strong>Movimentos registrados</strong><small>Estorno corrige erro; devolução registra dinheiro realmente devolvido</small></div>
        {(detail.movimentos||[]).length ? <div className="vd-ledger">{detail.movimentos.map(m=><div key={m.id} className="vd-ledger-entry">
          <div><strong>{m.tipo==='ESTORNO'?'Estorno (correção)':m.tipo==='DEVOLUCAO'?'Devolução real':'Recebimento'} · {m.forma_nome}</strong>
            <small>{dateBR(m.data_movimento)} · {m.detentor==='CORRETOR'?'Com você':'Com a empresa'} · Lançamento #{m.id}</small>
            {m.observacoes&&<small>{m.observacoes}</small>}</div>
          <strong className={m.tipo==='ENTRADA'?'vd-positive':'vd-negative'}>{m.tipo==='ENTRADA'?'+':'-'}{currency(m.valor)}</strong>
        </div>)}</div>:<div className="com-empty vd-empty">Nenhum recebimento lançado.</div>}
        {detail.operacao.observacao_comissao&&<div className="com-inform">{detail.operacao.observacao_comissao}</div>}
        <div className="vd-detail-title"><span>{detail.operacao.comissao_ajustada!==null?'Comissão ajustada (a apurar)':'Comissão prevista (não paga)'}: <strong>{detail.operacao.comissao_ajustada!==null?currency(detail.operacao.comissao_ajustada):detail.operacao.comissao_prevista===null?'Após quitação':currency(detail.operacao.comissao_prevista)}</strong></span></div>
        {detail.operacao.ajuste_motivo&&<div className="com-inform">Justificativa do ajuste: {detail.operacao.ajuste_motivo}</div>}
        <div className="vd-rateios-toggle">
          <button type="button" className="vd-outline" onClick={()=>setShowRateios(x=>!x)}
            aria-expanded={showRateios}>{showRateios?'Ocultar participações':'Conferir / ajustar participações'}</button>
          <small>Atendimento, gerência, corretor e arredondamentos antes do fechamento semanal.</small>
        </div>
        {showRateios&&<RateiosVenda operacaoId={dialog.op.id} pessoas={people}
          onSaved={async()=>{await refresh();setDetail(await comercialGet('/api/vendas/'+dialog.op.id))}}/>}
        {!!detail.historico_correcoes?.length&&<div className="vd-corrections">
          <strong>Histórico de correções</strong>
          {detail.historico_correcoes.map(h=><div key={h.id}>
            <small>{dateBR(h.criado_em,true)} · Correção de dados</small>
            <span>{h.justificativa}</span>
          </div>)}
        </div>}
        <div className="com-inform">Pagamento de comissão, valores a repassar ao clube e despesas serão controlados separadamente no fechamento. O lançamento de Pix acima não significa que a comissão já foi paga.</div>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions vd-wrap">
          <button type="button" className="cm-button" onClick={()=>setDialog(null)}>Fechar</button>
          <button type="button" className="cm-button" disabled={!detail.editavel} onClick={openEdit}>Editar cadastro</button>
          <button type="button" className="cm-button" onClick={openAdjustment}>Ajustar comissão</button>
          <button type="button" className="cm-button" disabled={!entryRecords.length} onClick={()=>{setMoveForm(blankMovement());setFormError('');setDialog({type:'reversal',op:dialog.op})}}>Estornar lançamento</button>
          <button type="button" className="cm-button" disabled={!entryRecords.length} onClick={()=>{setMoveForm(blankMovement());setFormError('');setDialog({type:'refund',op:dialog.op})}}>Devolver dinheiro</button>
          <button type="button" className="cm-button primary" disabled={Number(detail.saldo)<=0} onClick={()=>{setMoveForm({...blankMovement(),valor:suggestedAmount(detail.saldo)});setFormError('');setDialog({type:'receipt',op:dialog.op})}}>Registrar recebimento</button>
        </div>
      </div>}

      {dialog.type==='adjust'&&<form className="cm-form" onSubmit={saveAdjustment}>
        <div className="com-inform">O clube pode arredondar a comissão. O ajuste será registrado com justificativa e não realiza repasse financeiro.</div>
        <label><span className="field-caption">Valor final da comissão (R$) <em>*</em></span>
          <input type="text" inputMode="decimal" value={adjustment.valor}
            onChange={e=>setAdjustment(f=>({...f,valor:e.target.value}))} placeholder="Ex.: 306,65"/></label>
        <label><span className="field-caption">Justificativa <em>*</em></span>
          <textarea rows={3} maxLength={500} value={adjustment.justificativa}
            onChange={e=>setAdjustment(f=>({...f,justificativa:e.target.value}))}
            placeholder="Ex.: Arredondamento confirmado pelo clube"/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog({type:'details',op:dialog.op})}>Voltar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>{busy?'Salvando...':'Salvar ajuste'}</button></div>
      </form>}

      {['receipt','refund','reversal'].includes(dialog.type)&&<form className="cm-form" onSubmit={saveMovement}>
        <div className="com-inform">{dialog.type==='reversal'
          ? 'ESTORNO é apenas uma correção de lançamento incorreto. Nenhum dinheiro é devolvido ao cliente. O sistema anula o saldo registrado dessa entrada e preserva o histórico. Depois, registre o recebimento certo.'
          : dialog.type==='refund'
          ? 'DEVOLUÇÃO significa dinheiro de fato devolvido ao cliente e mantém o responsável por esse dinheiro. Não utilize para corrigir erro de digitação.'
          : 'Informe quanto o CLIENTE realmente pagou pelo título. Isso não significa comissão recebida. Pix fica com o corretor responsável pela arrecadação; crédito fica com a empresa.'}</div>
        {['refund','reversal'].includes(dialog.type)?<label>Recebimento original
          <FormControl type="select" value={moveForm.entrada_id}
            onChange={v=>setMoveForm(f=>({...f,entrada_id:v}))}
            options={entryRecords.map(r=>({value:String(r.id),
              label:'#'+r.id+' · '+r.forma_nome+' · disponível '+currency(r.saldo_estornavel)}))}
            placeholder="Escolha o recebimento original"/></label>:
          <label><span className="field-caption">Forma de pagamento <em>*</em></span>
            <FormControl type="select" value={moveForm.forma_id}
              onChange={v=>setMoveForm(f=>({...f,forma_id:v}))}
              options={options.formas.filter(x=>x.ativo).map(x=>({value:String(x.id),label:x.nome}))}
              placeholder="Selecione a forma"/></label>}
        {dialog.type==='receipt' && <label>Onde o dinheiro ficou
          {currentMethod?.codigo==='PIX'||currentMethod?.credito
            ? <div className="vd-readonly">{currentMethod.codigo==='PIX'?'Com você (Pix)':'Com a empresa (crédito)'}</div>
            : <FormControl type="select" value={moveForm.detentor}
                onChange={v=>setMoveForm(f=>({...f,detentor:v}))}
                options={[{value:'CORRETOR',label:'Com você'},{value:'EMPRESA',label:'Com a empresa'}]}/>}
        </label>}
        {dialog.type!=='reversal'&&<div className="cm-form-grid"><label><span className="field-caption">Valor (R$) <em>*</em></span>
          <input type="text" inputMode="decimal" value={moveForm.valor}
            onChange={e=>setMoveForm(f=>({...f,valor:e.target.value}))} placeholder="Ex.: 200,00"/></label>
          <label>Data do movimento <FormControl type="date" value={moveForm.data_movimento}
            onChange={v=>setMoveForm(f=>({...f,data_movimento:v}))}/></label></div>}
        <label>{dialog.type==='refund'?'Motivo da devolução':dialog.type==='reversal'?'Motivo do erro no lançamento':'Observações'}
          <textarea rows={2} maxLength={500} value={moveForm.observacoes}
            onChange={e=>setMoveForm(f=>({...f,observacoes:e.target.value}))}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" disabled={busy}
          onClick={()=>setDialog({type:'details',op:dialog.op})}>Voltar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>
            {busy?'Gravando...':dialog.type==='refund'?'Confirmar devolução':dialog.type==='reversal'?'Confirmar estorno':'Registrar recebimento'}</button></div>
      </form>}

      {dialog.type==='settings'&&<div className="cm-form">
        <div className="com-toggle"><button type="button" className={setting==='aplicacoes'?'active':''}
          onClick={()=>setSetting('aplicacoes')}>Aplicação</button>
          <button type="button" className={setting==='regras'?'active':''}
          onClick={()=>setSetting('regras')}>Regras</button>
          <button type="button" className={setting==='formas'?'active':''} onClick={()=>setSetting('formas')}>Pagamentos</button></div>
        <div className="com-inform">As regras são aplicadas automaticamente conforme os recebimentos do cliente. Cada operação guarda os percentuais vigentes no momento do cadastro, mesmo após futuras alterações.</div>
        <div className="vd-settings-list">{setting==='aplicacoes'
          ?(options.aplicacoes||[]).map(a=><div key={a.codigo}>
            <span><strong>{{AVISTA_ATUAL:'À vista atual',AVISTA_HISTORICA:'À vista histórico',CARTAO:'Cartão de crédito',MISTO:'Pagamento misto'}[a.codigo]||a.codigo}</strong>
              <small>{options.regras.find(r=>Number(r.id)===Number(a.regra_comissao_id))?.nome||'Regra indisponível'}</small></span>
            <button className="cm-button" type="button" onClick={()=>openApplication(a)}>Alterar</button>
          </div>)
          :(setting==='regras'?options.regras:options.formas).map(x=><div key={x.id}>
          <span><strong>{x.nome}</strong><small>{x.ativo?'Ativo':'Inativo'}</small></span>
          <button className="cm-button" type="button" onClick={()=>openSetting(x)}>Editar</button></div>)}</div>
        <div className="cm-form-actions"><button className="cm-button" type="button" onClick={()=>setDialog(null)}>Fechar</button>
          {setting!=='aplicacoes'&&<button className="cm-button primary" type="button" onClick={()=>openSetting()}>＋ Novo cadastro</button>}</div>
      </div>}

      {dialog.type==='application'&&<form className="cm-form" onSubmit={saveApplication}>
        <div className="com-inform">Escolha qual modelo será aplicado automaticamente às próximas vendas. Não altera vendas já cadastradas.</div>
        <label>Regra de comissão
          <FormControl type="select" value={applying.regra_comissao_id}
            onChange={v=>setApplying(f=>({...f,regra_comissao_id:v}))}
            options={options.regras.filter(r=>r.modalidade===(applying.codigo.startsWith('AVISTA')?'AVISTA':applying.codigo))
              .map(r=>({value:String(r.id),label:r.nome}))}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog({type:'settings'})}>Voltar</button>
          <button className="cm-button primary" type="submit" disabled={busy}>{busy?'Salvando...':'Salvar aplicação'}</button></div>
      </form>}

      {dialog.type==='setting'&&settingForm&&<form className="cm-form" onSubmit={saveSetting}>
        <label><span className="field-caption">Descrição <em>*</em></span><input required maxLength={100} value={settingForm.nome}
          onChange={e=>setSettingForm(f=>({...f,nome:e.target.value}))}/></label>
        {setting==='regras'?<>
          <label>Modalidade <FormControl type="select" value={settingForm.modalidade}
            onChange={v=>setSettingForm(f=>({...f,modalidade:v}))}
            options={[{value:'AVISTA',label:'À vista'},{value:'CARTAO',label:'Cartão de crédito'},{value:'MISTO',label:'Misto'}]}/></label>
          <div className="cm-form-grid"><label>Numerador<input type="number" min="1" max="1000"
            value={settingForm.numerador} onChange={e=>setSettingForm(f=>({...f,numerador:e.target.value}))}/></label>
            <label>Denominador<input type="number" min="1" max="1000"
              value={settingForm.denominador} onChange={e=>setSettingForm(f=>({...f,denominador:e.target.value}))}/></label></div>
          <label>Desconto sobre comissão (%)<input type="text" inputMode="decimal"
            value={settingForm.desconto_cartao}
            onChange={e=>setSettingForm(f=>({...f,desconto_cartao:e.target.value}))} placeholder="Ex.: 8.000"/></label>
          <div className="com-inform">40% = numerador 40, denominador 100. Um terço = 1 e 3. O desconto é percentual da parcela da comissão sujeita à regra.</div>
        </>:<>
          <label><span className="field-caption">Código <em>*</em></span><input maxLength={25} value={settingForm.codigo}
            onChange={e=>setSettingForm(f=>({...f,codigo:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,'')}))}/></label>
          <label className="cm-status-switch"><span><strong>Cartão de crédito</strong><small>Valores retidos pela empresa</small></span>
            <input type="checkbox" checked={settingForm.credito} onChange={e=>setSettingForm(f=>({...f,credito:e.target.checked}))}/></label>
        </>}
        <label className="cm-status-switch"><span><strong>Ativo</strong><small>Disponível em novas operações</small></span>
          <input type="checkbox" checked={settingForm.ativo} onChange={e=>setSettingForm(f=>({...f,ativo:e.target.checked}))}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setDialog({type:'settings'})}>Voltar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>{busy?'Salvando...':'Salvar configuração'}</button></div>
      </form>}
    </SurfaceModal>}
  </div>
}
