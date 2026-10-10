import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,dateBR,localDateISO} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './ComercialPages.css'
import './RegrasComissoes.css'

const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0))
const decimal=v=>{
  const s=String(v??'').trim(),normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)?normalized:null
}
const emptyRule=()=>({plano_versao_id:'',modalidade:'TODOS',tipo_dia:'TODOS',
  papel:'ATENDENTE',tipo_calculo:'FIXO',valor:'',observacoes:''})
const fields=[
  ['percentual_atendente_dia_util','Atendimento em dia útil (%)'],
  ['percentual_atendente_outros_dias','Atendimento em fim de semana/feriado (%)'],
  ['percentual_gerente','Gerência (%)'],
  ['divisao_segundo_corretor','Segundo corretor sobre saldo (%)'],
  ['atendente_um_ano_valor','Atendimento em plano de 12 meses (R$)'],
  ['adicional_atendente_avista','Adicional para atendimento à vista (R$)'],
]
export default function RegrasComissoes(){
  const [tab,setTab]=useState('gerais')
  const [data,setData]=useState(null)
  const [policy,setPolicy]=useState(null)
  const [newRule,setNewRule]=useState(emptyRule)
  const [holiday,setHoliday]=useState({data:localDateISO(),descricao:''})
  const [range,setRange]=useState({inicio:localDateISO(),fim:localDateISO()})
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [removeId,setRemoveId]=useState(null)
  async function refresh(replacePolicy=false){
    const values=await comercialGet('/api/fechamentos/politica')
    setData(values)
    if(replacePolicy||!policy)setPolicy(values.politica)
  }
  useEffect(()=>{
    let active=true
    comercialGet('/api/fechamentos/politica').then(r=>{
      if(!active)return
      setData(r);setPolicy(r.politica)
    }).catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[])
  async function call(url,payload){
    setBusy(true);setError('');setMessage('')
    try{
      const result=await comercialPost(url,payload)
      setMessage(result.message||'Alterações salvas.')
      await refresh(false)
      return true
    }catch(e){setError(e.message);return false}
    finally{setBusy(false)}
  }
  async function savePolicy(e){
    e.preventDefault()
    const values={...policy}
    for(const key of ['atendente_um_ano_valor','adicional_atendente_avista']){
      const parsed=decimal(values[key])
      if(parsed===null)return setError('Informe valores válidos em reais nos campos de atendimento anual e adicional à vista.')
      values[key]=parsed
    }
    if(await call('/api/fechamentos/politica',values))await refresh(true)
  }
  async function saveRule(e){
    e.preventDefault()
    const parsed=decimal(newRule.valor)
    if(parsed===null||Number(parsed)<=0)return setError('Informe valor fixo ou percentual maior que zero.')
    if(await call('/api/fechamentos/excecoes',{...newRule,plano_versao_id:Number(newRule.plano_versao_id),valor:parsed})){
      setNewRule(emptyRule())
    }
  }
  async function saveHoliday(e){
    e.preventDefault()
    if(await call('/api/fechamentos/feriados',holiday))setHoliday({data:localDateISO(),descricao:''})
  }
  async function removeRule(id){
    if(removeId!==id)return setRemoveId(id)
    if(await call('/api/fechamentos/excecoes/'+id+'/excluir',{}))setRemoveId(null)
  }
  async function syncPrevious(e){
    e.preventDefault()
    if(!range.inicio||!range.fim||range.inicio>range.fim)
      return setError('Informe um período válido para a apuração.')
    const ok=await call('/api/fechamentos/sincronizar',range)
    if(ok)setMessage('Apuração executada. Rateios já apurados ou pagos foram preservados. Verifique eventuais vendas que exigem revisão manual.')
  }
  const planOptions=(data?.planos||[]).map(p=>({value:String(p.id),
    label:p.codigo+' · '+money(p.valor)+' · '+p.duracao_meses+' meses'}))
  return <div className="com-page rcm-page">
    <header className="com-heading"><div>
      <span className="com-eyebrow">SPLASH / CONFIGURAÇÕES</span>
      <h1>Regras de comissões</h1>
      <p>Defina os valores para novas apurações. Para corrigir uma venda específica, abra a venda em Vendas → Participações.</p>
    </div></header>
    {error&&<div className="com-alert error" role="alert">{error}</div>}
    {message&&<div className="com-alert success" role="status">{message}</div>}
    {loading?<section className="com-panel"><div className="com-empty">Carregando regras...</div></section>:
    !data||!policy?<section className="com-panel"><p>Não foi possível carregar as configurações.</p>
      <button type="button" className="vd-outline" onClick={()=>{setLoading(true);refresh(true).catch(e=>setError(e.message)).finally(()=>setLoading(false))}}>Tentar novamente</button>
    </section>:<>
      <div className="rcm-tabs" role="tablist" aria-label="Configuração das comissões">
        {[['gerais','Valores padrão'],['planos','Exceções por plano'],['feriados','Feriados'],['anteriores','Apurar vendas pendentes']].map(([id,label])=>
          <button key={id} type="button" role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>{setTab(id);setError('');setMessage('')}}>{label}</button>)}
      </div>
      {tab==='gerais'&&<section className="com-panel rcm-panel">
        <div className="com-panel-head"><div><h2>Valores para as próximas vendas</h2><p>Um plano de 12 meses usa o valor fixo no atendimento. Em pagamento integral à vista, soma-se o adicional ao atendimento. Regras específicas por plano têm prioridade sobre o valor base.</p></div></div>
        <form onSubmit={savePolicy} className="rcm-form">
          <div className="rcm-grid">{fields.map(([field,label])=>
            <label key={field}>{label}<input type="number" min="0" max={field.startsWith('percentual')||field==='divisao_segundo_corretor'?'100':'100000'} step=".01"
              required value={policy[field]??''} onChange={e=>setPolicy(p=>({...p,[field]:e.target.value}))}/></label>)}</div>
          <div className="rcm-example"><strong>Como será calculado</strong>
            <p>Exemplo: plano de 12 meses → atendimento R$ 60,00. Se a venda for integralmente à vista, o atendimento recebe também o adicional configurado. A gerência segue o percentual indicado sobre o preço do plano, quando aplicável.</p>
            <small>Os valores são aplicados quando a venda estiver quitada e for apurada. Comissões e rateios antigos não são recalculados automaticamente.</small></div>
          <div className="rcm-actions"><button className="com-main-button" disabled={busy} type="submit">{busy?'Salvando...':'Salvar regras'}</button></div>
        </form>
      </section>}
      {tab==='planos'&&<section className="com-panel rcm-panel">
        <div className="com-panel-head"><div><h2>Exceções por versão de plano</h2><p>Use somente quando um plano, forma de pagamento ou dia precisar de valores diferentes do padrão. Os valores são por participante, antes dos repasses efetivos.</p></div></div>
        <form className="rcm-form" onSubmit={saveRule}>
          <div className="rcm-grid">
            <label>Versão do plano <FormControl type="select" value={newRule.plano_versao_id}
              onChange={v=>setNewRule(x=>({...x,plano_versao_id:v}))} options={planOptions} placeholder="Selecione o plano"/></label>
            <label>Forma de pagamento <FormControl type="select" value={newRule.modalidade}
              onChange={v=>setNewRule(x=>({...x,modalidade:v}))}
              options={[{value:'TODOS',label:'Todas'},{value:'AVISTA',label:'À vista'},{value:'CARTAO',label:'Cartão'},{value:'MISTO',label:'Misto'}]}/></label>
            <label>Dia <FormControl type="select" value={newRule.tipo_dia} onChange={v=>setNewRule(x=>({...x,tipo_dia:v}))}
              options={[{value:'TODOS',label:'Todos'},{value:'UTIL',label:'Dia útil'},{value:'OUTROS',label:'Feriado / fim de semana'}]}/></label>
            <label>Função <FormControl type="select" value={newRule.papel} onChange={v=>setNewRule(x=>({...x,papel:v}))}
              options={[{value:'ATENDENTE',label:'Atendimento / vendedor'},{value:'GERENTE',label:'Gerência'}]}/></label>
            <label>Cálculo <FormControl type="select" value={newRule.tipo_calculo} onChange={v=>setNewRule(x=>({...x,tipo_calculo:v}))}
              options={[{value:'FIXO',label:'Valor fixo (R$)'},{value:'PERCENTUAL',label:'Percentual (%)'}]}/></label>
            <label>Valor <input value={newRule.valor} onChange={e=>setNewRule(x=>({...x,valor:e.target.value}))} placeholder="Ex.: 60,00" required inputMode="decimal"/></label>
          </div>
          <label>Observações <input maxLength={350} value={newRule.observacoes}
            onChange={e=>setNewRule(x=>({...x,observacoes:e.target.value}))} placeholder="Motivo da exceção"/></label>
          <div className="rcm-actions"><button className="com-main-button" disabled={busy||!newRule.plano_versao_id} type="submit">Salvar exceção</button></div>
        </form>
        <div className="rcm-records"><h3>Exceções cadastradas</h3>
          {(data.excecoes||[]).length===0&&<p>Nenhuma exceção específica cadastrada.</p>}
          {(data.excecoes||[]).map(x=><div key={x.id}>
            <span><strong>{planOptions.find(p=>p.value===String(x.plano_versao_id))?.label||'Plano #'+x.plano_versao_id}</strong>
              <small>{x.papel==='ATENDENTE'?'Atendimento':'Gerência'} · {x.modalidade} · {x.tipo_dia} · {x.tipo_calculo==='FIXO'?money(x.valor):x.valor+'%'}</small>
            </span>
            <button type="button" className="vd-outline" disabled={busy} onClick={()=>removeRule(x.id)}>
              {removeId===x.id?'Confirmar exclusão':'Excluir'}</button>
          </div>)}
        </div>
      </section>}
      {tab==='feriados'&&<section className="com-panel rcm-panel">
        <div className="com-panel-head"><div><h2>Feriados considerados na apuração</h2>
          <p>Datas cadastradas podem ativar exceções por tipo de dia. Não alteram vendas já apuradas.</p></div></div>
        <form className="rcm-form" onSubmit={saveHoliday}>
          <div className="rcm-grid">
            <label>Data <FormControl type="date" value={holiday.data} onChange={v=>setHoliday(x=>({...x,data:v}))}/></label>
            <label>Descrição <input required maxLength={120} value={holiday.descricao}
              onChange={e=>setHoliday(x=>({...x,descricao:e.target.value}))} placeholder="Ex.: feriado municipal"/></label>
          </div><div className="rcm-actions"><button className="com-main-button" type="submit" disabled={busy}>Salvar feriado</button></div>
        </form>
        <div className="rcm-records"><h3>Feriados cadastrados</h3>
          {(data.feriados||[]).map(h=><div key={h.data}><strong>{dateBR(h.data)}</strong><span>{h.descricao}</span></div>)}
        </div>
      </section>}
      {tab==='anteriores'&&<section className="com-panel rcm-panel">
        <div className="com-panel-head"><div><h2>Apurar vendas ainda pendentes</h2>
          <p>Aplica as regras atuais apenas a vendas quitadas que ainda não tiveram apuração. Não sobrescreve participações manuais nem pagamentos anteriores.</p></div></div>
        <form onSubmit={syncPrevious} className="rcm-form">
          <div className="rcm-grid">
            <label>Data inicial <FormControl type="date" value={range.inicio} onChange={v=>setRange(p=>({...p,inicio:v}))}/></label>
            <label>Data final <FormControl type="date" value={range.fim} onChange={v=>setRange(p=>({...p,fim:v}))}/></label>
          </div><div className="rcm-actions"><button type="submit" className="com-main-button" disabled={busy}>{busy?'Apurando...':'Apurar vendas pendentes'}</button></div>
        </form>
      </section>}
    </>}
  </div>
}
