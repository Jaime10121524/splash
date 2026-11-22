import {useCallback,useEffect,useState} from 'react'
import {comercialGet,comercialPost,localDateISO,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './ComercialPages.css'

const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0)
const decimal=raw=>{
  const str=String(raw||'').trim().replace(/^R\$\s*/,'')
  const value=str.includes(',')?str.replace(/\./g,'').replace(',','.'):str
  return /^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)>0?Number(value).toFixed(2):null
}
const blank=()=>({origem:'CORRETOR',beneficiario_pessoa_id:'',valor:'',
  data_movimento:localDateISO(),observacoes:''})

export default function PendenciaCustodia({operacaoId}){
  const [custodia,setCustodia]=useState(null)
  const [pessoas,setPessoas]=useState([])
  const [form,setForm]=useState(blank)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [estorno,setEstorno]=useState(null)
  const [motivo,setMotivo]=useState('')
  const load=useCallback(async()=>{
    const data=await comercialGet('/api/vendas/'+operacaoId+'/custodia')
    setCustodia(data)
  },[operacaoId])
  useEffect(()=>{
    let current=true
    Promise.all([
      comercialGet('/api/vendas/'+operacaoId+'/custodia'),
      comercialGet('/api/pessoas'),
    ]).then(([data,people])=>{
      if(!current)return
      setCustodia(data);setPessoas(people.pessoas||[])
    }).catch(e=>{if(current)setError(e.message)})
    return()=>{current=false}
  },[operacaoId])
  const recipients=pessoas.filter(p=>p.ativo&&p.papeis.some(r=>r==='vendedor'||r==='gerente'))
    .map(p=>({value:String(p.id),label:p.nome+' ('+p.papeis.filter(r=>r==='vendedor'||r==='gerente').join(', ')+')'}))
  const returned=new Set((custodia?.movimentos||[]).filter(m=>m.tipo==='ESTORNO')
    .map(m=>Number(m.referencia_adiantamento_id)))
  const pending=custodia?.situacao==='PENDENCIA'
  async function save(e){
    e.preventDefault();setError('');setNotice('')
    const value=decimal(form.valor)
    if(!value||!form.beneficiario_pessoa_id||form.observacoes.trim().length<3){
      setError('Informe beneficiário, valor e motivo do adiantamento.');return
    }
    setBusy(true)
    try{
      const result=await comercialPost('/api/vendas/'+operacaoId+'/adiantamentos',{
        ...form,valor:value,beneficiario_pessoa_id:Number(form.beneficiario_pessoa_id),
      })
      setNotice(result.message);setForm(blank());await load()
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function reverse(){
    if(!estorno||motivo.trim().length<5){
      setError('Selecione o adiantamento e informe o motivo do estorno.');return
    }
    setBusy(true);setError('')
    try{
      const r=await comercialPost('/api/vendas/'+operacaoId+'/adiantamentos/estornar',{
        adiantamento_id:Number(estorno),justificativa:motivo.trim(),
      })
      setNotice(r.message);setEstorno(null);setMotivo('');await load()
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  return <div className="cm-form">
    <div className="com-inform">
      Custódia registra onde ficou o dinheiro recebido e os adiantamentos aos vendedores e gestores.
      Nenhum valor antecipado vira automaticamente comissão paga.
    </div>
    {error&&<p className="cm-error" role="alert">{error}</p>}
    {notice&&<div className="com-inform" role="status">{notice}</div>}
    {!custodia?<p>Carregando custódia...</p>:<>
      <div className="com-stats">
        <article><span>Em poder do clube</span><strong>{money(custodia.saldos.EMPRESA)}</strong></article>
        <article><span>Em poder do corretor</span><strong>{money(custodia.saldos.CORRETOR)}</strong></article>
      </div>
      {pending&&<form className="cm-form" onSubmit={save}>
        <h3>Registrar adiantamento</h3>
        <label>Quem liberou o valor?
          <FormControl type="select" value={form.origem}
            onChange={v=>setForm(f=>({...f,origem:v}))}
            options={[{value:'CORRETOR',label:'Corretor'},{value:'EMPRESA',label:'Clube'}]}/>
        </label>
        <label>Beneficiário *
          <FormControl type="select" value={form.beneficiario_pessoa_id}
            onChange={v=>setForm(f=>({...f,beneficiario_pessoa_id:v}))}
            options={recipients} placeholder="Selecione vendedor ou gestor"/>
        </label>
        <div className="cm-form-grid">
          <label>Valor (R$) *<input required inputMode="decimal" value={form.valor}
            onChange={e=>setForm(f=>({...f,valor:e.target.value}))}/></label>
          <label>Data *<FormControl type="date" value={form.data_movimento}
            onChange={v=>setForm(f=>({...f,data_movimento:v}))}/></label>
        </div>
        <label>Justificativa *<textarea required maxLength={500} rows={2}
          value={form.observacoes} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))}/></label>
        <button type="submit" className="cm-button primary" disabled={busy}>
          {busy?'Salvando...':'Registrar adiantamento'}
        </button>
      </form>}
      <h3>Histórico de antecipações</h3>
      {(custodia.movimentos||[]).length===0?<p>Nenhuma antecipação registrada.</p>:
        (custodia.movimentos||[]).map(m=><div key={m.id} className="vd-ledger-entry">
          <div><strong>{m.beneficiario_nome} · {m.tipo==='ESTORNO'?'Estorno':'Adiantamento'}</strong>
            <small>{dateBR(m.data_movimento)} · {m.origem==='EMPRESA'?'Clube':'Corretor'} · {m.observacoes}</small></div>
          <strong>{m.tipo==='ESTORNO'?'+':'−'} {money(m.valor)}</strong>
          {pending&&m.tipo==='SAIDA'&&!returned.has(Number(m.id))&&
            <button type="button" className="cm-button" disabled={busy}
              onClick={()=>{setEstorno(m.id);setMotivo('')}}>Estornar</button>}
        </div>)}
      {pending&&estorno&&<div className="cm-form">
        <label>Motivo do estorno *<textarea value={motivo} rows={2} maxLength={500}
          onChange={e=>setMotivo(e.target.value)}/></label>
        <div className="cm-form-actions">
          <button type="button" className="cm-button" onClick={()=>setEstorno(null)}>Cancelar</button>
          <button type="button" className="cm-button primary" disabled={busy} onClick={reverse}>Confirmar estorno</button>
        </div>
      </div>}
    </>}
  </div>
}
