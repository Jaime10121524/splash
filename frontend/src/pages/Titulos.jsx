import {useEffect,useMemo,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import './ComercialPages.css'
import './Titulos.css'

const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const toCents=value=>Math.round(Number(value||0)*100)
const cleanMoney=value=>{
  const s=String(value??'').trim()
  const out=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(out)?out:null
}
function monthsLater(iso,count){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(count)||count<1)return ''
  const [year,month,day]=iso.split('-').map(Number)
  const last=new Date(year,month-1+count+1,0).getDate()
  const d=new Date(year,month-1+count,Math.min(day,last))
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
}
const statusLabel={ATIVO:'Ativo',A_VENCER:'A vencer',VENCIDO:'Vencido',A_QUITAR:'Aguardando pagamento'}
const blanks=()=>({
  tipo:'RENOVACAO',plano_versao_id:'',data_venda:localDateISO(),
  desconto_corretor:'0,00',justificativa:'',
  corretor_pessoa_id:'',segundo_corretor_pessoa_id:'',
  atendente_pessoa_id:'',atendente_adicional_pessoa_id:'',
  gerente_pessoa_id:'',
})

export default function Titulos({role='admin',navigate}){
  const admin=role==='admin'
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState('TODOS')
  const [titles,setTitles]=useState([])
  const [summary,setSummary]=useState({})
  const [options,setOptions]=useState({planos:[],pessoas:[]})
  const [modal,setModal]=useState(null)
  const [history,setHistory]=useState([])
  const [form,setForm]=useState(blanks)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [formError,setFormError]=useState('')
  const [newSale,setNewSale]=useState(null)

  async function reload(){
    const data=await comercialGet('/api/titulos?'+new URLSearchParams({q:search}))
    setTitles(data.titulos||[]);setSummary(data.resumo||{})
  }
  useEffect(()=>{
    let active=true
    setLoading(true)
    Promise.all([
      comercialGet('/api/titulos?'+new URLSearchParams({q:search})),
      admin?comercialGet('/api/titulos/opcoes'):Promise.resolve(null),
    ]).then(([data,opts])=>{
      if(!active)return
      setTitles(data.titulos||[]);setSummary(data.resumo||{})
      if(opts)setOptions(opts)
      setError('')
    }).catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[admin,search])

  const visible=titles.filter(t=>status==='TODOS'||t.status_titulo===status)
  const plan=options.planos.find(p=>String(p.id)===String(form.plano_versao_id))
  const source=modal?.source
  const initialDate=history[0]?.data_inicio||source?.data_inicio
  const planList=options.planos.filter(p=>form.tipo==='UPGRADE'
    ? Number(p.valor)>Number(source?.preco_plano_atual||0)
    : Number(p.plano_id)===Number(source?.familia_plano_id))
  const baseValue=plan?(form.tipo==='UPGRADE'
    ? Number(plan.valor)-Number(source?.preco_plano_atual||0)
    : Number(plan.valor)):0
  const discount=cleanMoney(form.desconto_corretor)
  const finalValue=discount===null?null:baseValue-Number(discount)
  const renewalStart=source&&form.data_venda
    ? (source.data_vencimento>form.data_venda?source.data_vencimento:form.data_venda):''
  const expectedDate=plan&&source?form.tipo==='RENOVACAO'
    ? monthsLater(renewalStart,Number(plan.duracao_meses))
    : [source.data_vencimento,monthsLater(initialDate,Number(plan.duracao_meses))].sort().at(-1):''
  const peopleByRole=roleName=>options.pessoas.filter(p=>roleName==='atendente'
    ? ['vendedor','corretor'].includes(p.papel)
    : p.papel===roleName).reduce((acc,p)=>{
      if(!acc.some(x=>x.value===String(p.id)))acc.push({value:String(p.id),label:p.nome})
      return acc
    },[])
  function set(key,value){setForm(prev=>({...prev,[key]:value}))}

  async function begin(sourceTitle){
    setBusy(true);setFormError('');setNewSale(null)
    try{
      const result=await comercialGet('/api/titulos/'+sourceTitle.id+'/historico')
      setHistory(result.historico||[])
      setForm({...blanks(),
        corretor_pessoa_id:String(sourceTitle.corretor_pessoa_id||''),
        segundo_corretor_pessoa_id:String(sourceTitle.segundo_corretor_pessoa_id||''),
        atendente_pessoa_id:String(sourceTitle.atendente_pessoa_id||''),
        atendente_adicional_pessoa_id:String(sourceTitle.atendente_adicional_pessoa_id||''),
        gerente_pessoa_id:String(sourceTitle.gerente_pessoa_id||''),
      })
      setModal({source:sourceTitle})
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function showHistory(t){
    setBusy(true);setFormError('')
    try{
      const result=await comercialGet('/api/titulos/'+t.id+'/historico')
      setHistory(result.historico||[]);setModal({history:t})
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function save(event){
    event.preventDefault();setFormError('')
    if(!source||!plan)return setFormError('Selecione um plano disponível.')
    if(!form.corretor_pessoa_id)return setFormError('Informe o corretor responsável.')
    if(!form.data_venda)return setFormError('Informe a data da operação.')
    if(form.justificativa.trim().length<5)return setFormError('Informe uma justificativa com pelo menos cinco caracteres.')
    if(discount===null||finalValue===null||toCents(finalValue)<=0)return setFormError('Confira o valor do desconto e a diferença a cobrar.')
    setBusy(true)
    try{
      const payload={...form,plano_versao_id:Number(form.plano_versao_id),
        desconto_corretor:discount,
        corretor_pessoa_id:Number(form.corretor_pessoa_id),
        segundo_corretor_pessoa_id:form.segundo_corretor_pessoa_id?Number(form.segundo_corretor_pessoa_id):null,
        atendente_pessoa_id:form.atendente_pessoa_id?Number(form.atendente_pessoa_id):null,
        atendente_adicional_pessoa_id:form.atendente_adicional_pessoa_id?Number(form.atendente_adicional_pessoa_id):null,
        gerente_pessoa_id:form.gerente_pessoa_id?Number(form.gerente_pessoa_id):null,
      }
      const result=await comercialPost('/api/titulos/'+source.id+'/movimentar',payload)
      setModal(null)
      setNotice(result.message)
      setNewSale(result.operacao_id)
      await reload()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  return <div className="com-page ti-page">
    <header className="com-heading">
      <div><span className="com-eyebrow">SPLASH / TÍTULOS</span>
        <h1>Títulos e renovações</h1>
        <p>{admin?'Consulte os vencimentos, prorrogue um título e registre upgrades preservando todo o histórico.':
          'Acompanhe a validade dos títulos vinculados às suas vendas, sem informações pessoais de clientes.'}</p>
      </div>
    </header>
    {notice&&<div className="com-alert success" role="status">{notice}
      <button type="button" onClick={()=>setNotice('')}>Fechar</button></div>}
    {newSale&&<section className="com-panel ti-next">
      <div><strong>Nova operação registrada.</strong>
        <p>O cliente ainda precisa pagar essa renovação ou diferença do upgrade. A comissão será calculada e apurada quando a nova venda for quitada.</p></div>
      <button type="button" className="com-main-button" onClick={()=>navigate('vendas',{operacao_id:newSale})}>Abrir venda #{newSale} / Receber pagamento →</button>
    </section>}
    {error&&<div className="com-alert error" role="alert">{error}
      <button type="button" onClick={()=>{setError('');reload().catch(e=>setError(e.message))}}>Tentar novamente</button></div>}
    <section className="ti-kpis">
      {[
        ['Títulos atuais',summary.total||0],
        ['Ativos',summary.ativos||0],
        ['A vencer em 60 dias',summary.a_vencer||0],
        ['Vencidos',summary.vencidos||0],
        ['Novas cobranças pendentes',summary.a_quitar||0],
      ].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </section>
    <section className="com-panel">
      <div className="com-panel-head"><div><h2>Carteira atual de títulos</h2>
        <p>Somente a última versão de cada título. As anteriores permanecem disponíveis no histórico.</p></div>
        <span className="com-count">{visible.length} encontrados</span></div>
      <div className="ti-filters">
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={admin?'Cliente, número ou sigla...':'Número ou sigla do título...'}
          aria-label="Pesquisar títulos"/>
        <FormControl type="select" value={status} onChange={setStatus} options={[
          {value:'TODOS',label:'Todas as situações'},
          {value:'ATIVO',label:'Ativos'},
          {value:'A_VENCER',label:'A vencer em 60 dias'},
          {value:'VENCIDO',label:'Vencidos'},
          {value:'A_QUITAR',label:'Aguardando pagamento'},
        ]}/>
      </div>
      {loading?<div className="com-empty">Carregando títulos...</div>:
        visible.length===0?<div className="com-empty"><strong>Nenhum título encontrado</strong>
          <p>Os títulos de vendas concluídas aparecem aqui automaticamente.</p></div>:
        <div className="ti-list">{visible.map(t=><article className="ti-item" key={t.id}>
          <div className="ti-item-header">
            <div className="ti-item-title"><strong>{t.numero_titulo} {t.sigla_plano}</strong>
              <span className={'ti-status '+t.status_titulo.toLowerCase()}>{statusLabel[t.status_titulo]}</span>
              {t.movimento_origem&&<span className="ti-has-history">{t.movimento_origem==='UPGRADE'?'Upgrade':'Renovado'}</span>}
            </div>
            <div className="ti-item-main">
              {admin&&<strong>{t.cliente_nome}</strong>}
              <small>Corretor: {t.corretor_nome}</small>
            </div>
          </div>
          <div className="ti-meta">
            <div><span>Início da vigência</span><strong>{dateBR(t.data_inicio)}</strong></div>
            <div><span>{t.status_titulo==='A_QUITAR'?'Nova validade após quitação':'Vencimento'}</span><strong>{dateBR(t.data_vencimento)}</strong></div>
            {t.status_titulo==='A_QUITAR'&&<div><span>Vencimento do título anterior</span><strong>{dateBR(t.data_vencimento_vigente)}</strong></div>}
            <div><span>Data da venda</span><strong>{dateBR(t.data_venda)}</strong></div>
            {admin&&<div><span>Preço desta operação</span><strong>{money(t.valor_cobrado)}</strong></div>}
          </div>
          {admin&&<div className="ti-actions">
            <button type="button" onClick={()=>showHistory(t)} disabled={busy}>Histórico</button>
            <button type="button" onClick={()=>begin(t)} disabled={busy}>Renovar / Upgrade</button>
            <button type="button" onClick={()=>navigate('vendas',{operacao_id:t.id})}>Extrato da venda</button>
          </div>}
        </article>)}</div>}
    </section>
    <p className="com-disclaimer">Um título pode ser renovado várias vezes sem perder a numeração. O upgrade mantém o histórico e cobra somente a diferença de tabela. Nenhum movimento quita ou estorna comissões de vendas anteriores.</p>
    {modal&&<SurfaceModal
      title={modal.history?'Histórico do título':'Renovação ou upgrade'}
      subtitle={(source||modal.history)?.numero_titulo+' '+(source||modal.history)?.sigla_plano}
      busy={busy} onClose={()=>setModal(null)}>
      {modal.history?<div className="ti-history">
        {history.map((step,i)=><div className="ti-history-entry" key={step.operacao_id}>
          <div><strong>{i+1}. {step.tipo==='ORIGINAL'?'Venda original':step.tipo==='UPGRADE'?'Upgrade':'Renovação'}</strong>
            <span>{step.numero_titulo} {step.sigla_plano} · {dateBR(step.data_venda)}</span></div>
          <div><small>Vencimento: {dateBR(step.data_vencimento)}</small>
            <strong>{money(step.valor_cobrado)}</strong></div>
          {step.justificativa&&<p>{step.justificativa}</p>}
        </div>)}
        <div className="cm-form-actions"><button type="button" className="cm-button" onClick={()=>setModal(null)}>Fechar</button></div>
      </div>:<form className="cm-form ti-form" onSubmit={save}>
        <div className="ti-source">
          <div><span>Título atual</span><strong>{source.numero_titulo} {source.sigla_plano}</strong></div>
          <div><span>Vencimento anterior</span><strong>{dateBR(source.data_vencimento)}</strong></div>
          <div><span>Plano anterior</span><strong>{money(source.preco_plano_atual)}</strong></div>
        </div>
        <label>Tipo da operação
          <FormControl type="select" value={form.tipo} onChange={v=>setForm(f=>({...f,tipo:v,plano_versao_id:''}))}
            options={[{value:'RENOVACAO',label:'Renovação — acrescentar prazo'},
              {value:'UPGRADE',label:'Upgrade — mudar para plano maior'}]}/></label>
        <div className="com-inform">{form.tipo==='RENOVACAO'
          ? 'A renovação mantém o número do título e soma o prazo à data de vencimento atual. Se já estiver vencido, começa na data da nova venda.'
          : 'O upgrade mantém o número do título, substitui sua categoria e cobra a diferença entre o preço do plano novo e do plano atual. Nunca reduz a validade.'}</div>
        <label>Plano novo
          <FormControl type="select" value={form.plano_versao_id}
            onChange={v=>set('plano_versao_id',v)}
            options={[{value:'',label:'Escolha o plano'},...planList.map(p=>({
              value:String(p.id),label:p.codigo+' · '+money(p.valor)+' · '+p.duracao_meses+' meses'
            }))]}/></label>
        <label>Data da operação
          <FormControl type="date" value={form.data_venda} onChange={v=>set('data_venda',v)}/></label>
        <div className="ti-preview">
          <div><span>Valor desta nova operação</span><strong>{plan?money(baseValue):'Selecione o plano'}</strong></div>
          <div><span>Desconto concedido</span><input type="text" inputMode="decimal"
            value={form.desconto_corretor} onChange={e=>set('desconto_corretor',e.target.value)}
            aria-label="Desconto do cliente" placeholder="0,00"/></div>
          <div><span>Total a cobrar</span><strong>{plan&&finalValue!==null&&finalValue>0?money(finalValue):'—'}</strong></div>
          <div><span>Nova validade prevista</span><strong>{expectedDate?dateBR(expectedDate):'—'}</strong></div>
        </div>
        <div className="ti-people-grid">
          <label>Corretor principal *
            <FormControl type="select" value={form.corretor_pessoa_id} onChange={v=>set('corretor_pessoa_id',v)}
              options={peopleByRole('corretor')}/></label>
          <label>Segundo corretor
            <FormControl type="select" value={form.segundo_corretor_pessoa_id}
              onChange={v=>set('segundo_corretor_pessoa_id',v)}
              options={[{value:'',label:'Nenhum'},...peopleByRole('corretor').filter(p=>p.value!==form.corretor_pessoa_id)]}/></label>
          <label>Atendente
            <FormControl type="select" value={form.atendente_pessoa_id}
              onChange={v=>set('atendente_pessoa_id',v)}
              options={[{value:'',label:'Nenhum'},...peopleByRole('atendente')]}/></label>
          <label>Segundo atendente
            <FormControl type="select" value={form.atendente_adicional_pessoa_id}
              onChange={v=>set('atendente_adicional_pessoa_id',v)}
              options={[{value:'',label:'Nenhum'},...peopleByRole('atendente').filter(p=>p.value!==form.atendente_pessoa_id)]}/></label>
          <label>Gerente
            <FormControl type="select" value={form.gerente_pessoa_id}
              onChange={v=>set('gerente_pessoa_id',v)}
              options={[{value:'',label:'Nenhum'},...peopleByRole('gerente')]}/></label>
        </div>
        <label>Justificativa *
          <textarea value={form.justificativa} rows={2} maxLength={500}
            placeholder="Informe o motivo da renovação ou upgrade"
            onChange={e=>set('justificativa',e.target.value)}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions">
          <button type="button" className="cm-button" disabled={busy} onClick={()=>setModal(null)}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy||!plan}>{busy?'Salvando...':'Confirmar e criar nova venda'}</button>
        </div>
      </form>}
    </SurfaceModal>}
  </div>
}
