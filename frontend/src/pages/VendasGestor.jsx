import {useCallback,useEffect,useMemo,useState} from 'react'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import {FormControl} from '../components/UiFields.jsx'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import './ComercialPages.css'
import './VendasGestor.css'

const brl=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0))
const dateToday=()=>localDateISO()
const initialForm=()=>({visita_id:'',plano_versao_id:'',numero_titulo:'',
  data_venda:dateToday(),data_inicio:dateToday(),desconto_corretor:'0,00'})
const discountDecimal=value=>{
  const raw=String(value).trim()
  if(!raw)return null
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)?normalized:null
}

export default function VendasGestor({initialVisit=null,onVisitAccepted=()=>{}}){
  const [rows,setRows]=useState([])
  const [options,setOptions]=useState({planos:[],visitas:[],gerente_pessoa_id:null})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [dialog,setDialog]=useState(false)
  const [form,setForm]=useState(initialForm)
  const [filter,setFilter]=useState('')
  const [error,setError]=useState('')
  const [formError,setFormError]=useState('')
  const [notice,setNotice]=useState('')
  const load=useCallback(async()=>{
    const [list,opts]=await Promise.all([
      comercialGet('/api/gestor/vendas'),
      comercialGet('/api/gestor/vendas/opcoes'),
    ])
    setRows(list.vendas||[])
    setOptions(opts)
  },[])
  useEffect(()=>{
    let active=true
    setLoading(true)
    load().then(()=>{if(active)setError('')})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[load])
  useEffect(()=>{
    if(!initialVisit?.id)return
    setForm({...initialForm(),visita_id:String(initialVisit.id)})
    setDialog(true)
    onVisitAccepted()
  },[initialVisit?.id])

  const visit=options.visitas.find(v=>String(v.id)===String(form.visita_id))
  const plan=options.planos.find(p=>String(p.id)===String(form.plano_versao_id))
  const decimal=discountDecimal(form.desconto_corretor)
  const total=plan&&decimal!==null?Number(plan.valor)-Number(decimal):null
  const filtered=useMemo(()=>rows.filter(r=>
    (r.cliente_nome+' '+r.numero_titulo+' '+r.sigla_plano+' '+r.corretor_nome)
      .toLocaleLowerCase('pt-BR').includes(filter.trim().toLocaleLowerCase('pt-BR'))
  ),[rows,filter])
  function openNew(){
    setForm(initialForm());setFormError('');setDialog(true)
  }
  async function save(event){
    event.preventDefault()
    if(busy)return
    setFormError('')
    if(!visit)return setFormError('Escolha um atendimento concluído com venda.')
    if(!plan)return setFormError('Selecione o plano vendido.')
    if(!/^\d{4}$/.test(form.numero_titulo))return setFormError('Informe o título com quatro dígitos.')
    if(decimal===null||total===null||total<=0)return setFormError('Confira o desconto: o valor cobrado precisa ser positivo.')
    if(!form.data_venda||!form.data_inicio)return setFormError('Informe as datas da venda e da vigência.')
    setBusy(true)
    try{
      const result=await comercialPost('/api/gestor/vendas',{
        situacao:'VENDA',historica:false,
        visita_id:Number(visit.id),cliente_id:Number(visit.cliente_id),
        plano_versao_id:Number(plan.id),numero_titulo:form.numero_titulo,
        data_negociacao:form.data_venda,data_venda:form.data_venda,data_inicio:form.data_inicio,
        desconto_corretor:decimal,
        gerente_pessoa_id:Number(options.gerente_pessoa_id),
        corretor_pessoa_id:Number(visit.corretor_pessoa_id),
        segundo_corretor_pessoa_id:visit.segundo_corretor_pessoa_id,
        atendente_pessoa_id:visit.atendente_pessoa_id,
        atendente_adicional_pessoa_id:visit.atendente_adicional_pessoa_id,
      })
      setDialog(false)
      setNotice(result.message||'Venda cadastrada com sucesso.')
      await load()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }

  return <div className="com-page vg-page">
    <header className="com-heading">
      <div>
        <span className="com-eyebrow">SPLASH / GESTÃO COMERCIAL</span>
        <h1>Vendas sob sua gestão</h1>
        <p>Consulte vendas sob sua responsabilidade e cadastre títulos de atendimentos concluídos.
          Comissões e repasses de outras pessoas permanecem restritos.</p>
      </div>
      <button type="button" className="com-main-button" onClick={openNew}>+ Cadastrar venda</button>
    </header>
    {!!notice&&<div className="com-alert success" role="status">
      {notice}<button type="button" onClick={()=>setNotice('')}>Fechar</button>
    </div>}
    {!!error&&<div className="com-alert error" role="alert">{error}
      <button type="button" onClick={()=>{setLoading(true);load().then(()=>setError('')).catch(e=>setError(e.message)).finally(()=>setLoading(false))}}>Tentar novamente</button>
    </div>}
    <section className="com-panel">
      <div className="com-panel-head"><div><h2>Vendas registradas</h2>
        <p>Vendas em que você é o gerente ou responsável pelo cadastro.</p></div>
        <span className="com-count">{rows.length} vendas</span>
      </div>
      <div className="com-toolbar"><input value={filter} onChange={e=>setFilter(e.target.value)}
        aria-label="Pesquisar vendas" placeholder="Pesquisar cliente, título, plano ou corretor"/></div>
      {loading?<div className="com-empty">Carregando vendas...</div>:
        filtered.length===0?<div className="com-empty">
          <strong>Nenhuma venda encontrada.</strong>
          <p>Cadastre um título para um atendimento já finalizado como Venda.</p></div>:
        <div className="vg-list">
          {filtered.map(s=><article key={s.id} className="vg-item">
            <div><strong>{s.cliente_nome}</strong>
              <small>Título {s.numero_titulo} {s.sigla_plano} · {dateBR(s.data_venda)}</small>
              <small>Corretor: {s.corretor_nome||'Não informado'}</small></div>
            <strong className="vg-amount">{brl(s.valor_cobrado)}</strong>
          </article>)}
        </div>}
    </section>
    {dialog&&<SurfaceModal title="Cadastrar venda" subtitle="A venda precisa estar vinculada a um atendimento concluído."
      onClose={()=>{if(!busy)setDialog(false)}} busy={busy}>
      <form className="vg-form" onSubmit={save}>
        <label><span>Atendimento com venda fechada *</span>
          <FormControl type="select" value={form.visita_id}
            onChange={value=>setForm(f=>({...f,visita_id:value}))}
            options={[{value:'',label:'Selecione o atendimento'},
              ...options.visitas.map(v=>({value:String(v.id),
                label:'#'+v.id+' · '+v.cliente_nome+' · '+(v.corretor_nome||'Corretor')}))]}/></label>
        {visit&&<div className="vg-visit">
          <strong>{visit.cliente_nome}</strong><span>Corretor: {visit.corretor_nome||'Não informado'}</span>
        </div>}
        <label><span>Plano vendido *</span>
          <FormControl type="select" value={form.plano_versao_id}
            onChange={value=>setForm(f=>({...f,plano_versao_id:value}))}
            options={[{value:'',label:'Selecione o plano'},
              ...options.planos.map(p=>({value:String(p.id),
                label:p.codigo+' · '+brl(p.valor)+' · '+p.duracao_meses+' meses'}))]}/></label>
        <div className="vg-fields">
          <label><span>Número do título (4 dígitos) *</span>
            <FormControl value={form.numero_titulo} inputMode="numeric" maxLength={4}
              onChange={value=>setForm(f=>({...f,numero_titulo:value.replace(/\D/g,'')}))}/></label>
          <label><span>Desconto (R$)</span>
            <FormControl value={form.desconto_corretor} inputMode="decimal"
              onChange={value=>setForm(f=>({...f,desconto_corretor:value}))}/></label>
          <label><span>Data da venda *</span>
            <FormControl type="date" value={form.data_venda}
              onChange={value=>setForm(f=>({...f,data_venda:value}))}/></label>
          <label><span>Início da vigência *</span>
            <FormControl type="date" value={form.data_inicio}
              onChange={value=>setForm(f=>({...f,data_inicio:value}))}/></label>
        </div>
        {total!==null&&<div className="vg-total"><span>Valor cobrado</span><strong>{total>0?brl(total):'Desconto inválido'}</strong></div>}
        <p className="vg-note">O corretor, os atendentes e o cliente são herdados do atendimento. O gestor é vinculado ao seu usuário. Recebimentos e rateios não são registrados nesta tela.</p>
        {!!formError&&<div className="com-alert error" role="alert">{formError}</div>}
        <div className="vg-actions">
          <button type="button" className="com-refresh-button" disabled={busy} onClick={()=>setDialog(false)}>Cancelar</button>
          <button type="submit" className="com-main-button" disabled={busy}>{busy?'Salvando...':'Cadastrar título'}</button>
        </div>
      </form>
    </SurfaceModal>}
  </div>
}
