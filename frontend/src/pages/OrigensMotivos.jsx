import { useEffect, useState } from 'react'
import { SurfaceModal } from '../components/ComercialForms.jsx'
import { comercialGet, comercialPost } from '../lib/comercialApi.js'
import './ComercialPages.css'

const configs={
  origens:{title:'Origens dos leads',singular:'Origem',key:'nome',route:'origens',description:'De onde vem cada oportunidade comercial.'},
  motivos:{title:'Motivos de não venda',singular:'Motivo',key:'descricao',route:'motivos',description:'Por que o cliente não fechou o título.'},
}

export default function OrigensMotivos() {
  const [kind,setKind]=useState('origens')
  const [catalogs,setCatalogs]=useState({origens:[],motivos:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [modal,setModal]=useState(null)
  const [form,setForm]=useState({value:'',ativo:true,permite_indicador:false})
  const [busy,setBusy]=useState(false)
  const [formError,setFormError]=useState('')
  async function load(){
    setLoading(true)
    try{const data=await comercialGet('/api/comercial/opcoes');setCatalogs(data);setError('')}
    catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])
  function open(item=null){
    setModal(item||'new')
    setForm({value:item?.[configs[kind].key]||'',ativo:item?!!item.ativo:true,permite_indicador:!!item?.permite_indicador})
    setFormError('')
  }
  async function save(e){
    e.preventDefault();setBusy(true);setFormError('')
    try {
      const opt=configs[kind],id=modal==='new'?null:modal.id
      const url='/api/comercial/'+opt.route+(id?'/'+id+'/editar':'')
      const result=await comercialPost(url,{[opt.key]:form.value.trim(),ativo:form.ativo,...(kind==='origens'?{permite_indicador:form.permite_indicador}:{})})
      setModal(null);setNotice(result.message)
      await load()
    }catch(e){setFormError(e.message)}
    finally{setBusy(false)}
  }
  const opt=configs[kind],rows=catalogs[kind]||[]
  return <div className="com-page">
    <header className="com-heading"><div><span className="com-eyebrow">SISTEMA / CADASTROS</span>
      <h1>Origens e motivos</h1><p>Configure os campos usados nos clientes e nos resultados dos atendimentos.</p></div>
      <button type="button" className="com-main-button" onClick={()=>open()}>＋ Novo cadastro</button></header>
    {notice&&<div className="com-alert success" role="status">{notice}<button onClick={()=>setNotice('')}>Fechar</button></div>}
    {error&&<div className="com-alert error" role="alert">{error}<button onClick={load}>Tentar novamente</button></div>}
    <section className="com-panel">
      <div className="com-period-buttons com-config-tabs">
        {Object.entries(configs).map(([id,cfg])=><button type="button" key={id}
          className={kind===id?'active':''} onClick={()=>setKind(id)}>{cfg.title}</button>)}
      </div>
      <div className="com-panel-head"><div><h2>{opt.title}</h2><p>{opt.description}</p></div>
        <span className="com-count">{rows.length} cadastrado(s)</span></div>
      {loading?<div className="com-empty">Carregando...</div>:rows.length===0?
        <div className="com-empty"><strong>Nenhum cadastro</strong><p>Crie o primeiro registro.</p></div>:
        <div className="com-config-list">{rows.map(row=><div className="com-config-entry" key={row.id}>
          <div><strong>{row[opt.key]}</strong><small>{kind==='origens' && row.permite_indicador?'Permite informar cliente indicador · ':''}Identificador {row.id}</small></div>
          <span className={'com-pill '+(row.ativo?'good':'muted')}>{row.ativo?'Ativo':'Inativo'}</span>
          <button type="button" onClick={()=>open(row)}>Editar</button>
        </div>)}</div>}
    </section>
    <p className="com-disclaimer">Cadastros utilizados por clientes ou visitas não são apagados, para preservar o histórico. Inative o que não for mais utilizado.</p>
    {modal&&<SurfaceModal title={(modal==='new'?'Novo ':'Editar ')+opt.singular.toLowerCase()}
      onClose={()=>setModal(null)} busy={busy}>
      <form className="cm-form" onSubmit={save}>
        <label><span className="field-caption">Descrição <em>*</em></span><input autoFocus required maxLength={90}
          value={form.value} onChange={e=>setForm(f=>({...f,value:e.target.value}))}
          placeholder={kind==='origens'?'Ex.: Indicação':'Ex.: Preço'}/></label>
        {kind==='origens'&&<label className="cm-status-switch"><span><strong>Origem de indicação</strong><small>Mostrar campo Quem indicou no cadastro do cliente</small></span>
          <input type="checkbox" checked={form.permite_indicador} onChange={e=>setForm(f=>({...f,permite_indicador:e.target.checked}))}/></label>}
        <label className="cm-status-switch"><span><strong>Cadastro ativo</strong><small>Disponível em novos registros</small></span>
          <input type="checkbox" checked={form.ativo} onChange={e=>setForm(f=>({...f,ativo:e.target.checked}))}/></label>
        {formError&&<p className="cm-error" role="alert">{formError}</p>}
        <div className="cm-form-actions"><button type="button" className="cm-button" disabled={busy} onClick={()=>setModal(null)}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>{busy?'Salvando...':'Salvar'}</button></div>
      </form>
    </SurfaceModal>}
  </div>
}
