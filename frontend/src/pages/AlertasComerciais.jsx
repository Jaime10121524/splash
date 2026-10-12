import {useEffect,useState} from 'react'
import {comercialGet,comercialPost} from '../lib/comercialApi.js'
import './ComercialPages.css'
export default function AlertasComerciais(){
 const [settings,setSettings]=useState({titulos_dias:'90,60,30,7',pendencias_dias:60,retornos_antecedencia_dias:1,ativo:1})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useEffect(()=>{comercialGet('/api/alertas-comerciais/config').then(r=>setSettings(r.config)).catch(e=>setError(e.message))},[])
 const field=(name,value)=>setSettings(prev=>({...prev,[name]:value}))
 async function save(e){
  e.preventDefault();setError('');setNotice('');setBusy(true)
  try{const r=await comercialPost('/api/alertas-comerciais/config',settings);setNotice(r.message)}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 return <div className="com-page">
  <header className="com-heading"><div><span className="com-eyebrow">SPLASH / CONFIGURAÇÕES</span>
   <h1>Alertas comerciais</h1>
   <p>Configure quando avisar sobre títulos, retornos e negociações pendentes.</p></div></header>
  <section className="com-panel" style={{padding:'clamp(16px,3vw,26px)',maxWidth:750}}>
   <form onSubmit={save} className="cm-form">
    <label className="cm-status-switch"><span><strong>Alertas automáticos ativos</strong>
      <small>Desativar pausa novos lembretes, mas não apaga o histórico nem impede avisos de novas vendas e visitas.</small></span>
      <input type="checkbox" checked={!!Number(settings.ativo)} onChange={e=>field('ativo',e.target.checked?1:0)}/></label>
    <label>Avisar antes do vencimento do título (dias)
      <input type="text" value={settings.titulos_dias||''} onChange={e=>field('titulos_dias',e.target.value)}
        placeholder="90,60,30,7" required maxLength={80}/></label>
    <div className="com-inform">Separe os prazos por vírgula. Exemplo: 90,60,30,7. O sistema gera um aviso em cada prazo, sem duplicar notificações nas próximas execuções do cron.</div>
    <label>Pendência sem resolução há quantos dias?
      <input type="number" min={1} max={365} required value={settings.pendencias_dias}
        onChange={e=>field('pendencias_dias',e.target.value)}/></label>
    <label>Antecedência dos retornos agendados (dias)
      <input type="number" min={0} max={30} required value={settings.retornos_antecedencia_dias}
        onChange={e=>field('retornos_antecedencia_dias',e.target.value)}/></label>
    <div className="com-inform">Os avisos são registrados no sino do SPLASH. A entrega nativa ao celular depende de HTTPS, inscrição e chaves Push configuradas na hospedagem.</div>
    {error&&<p className="com-alert error" role="alert">{error}</p>}
    {notice&&<p className="com-alert success" role="status">{notice}</p>}
    <div className="cm-form-actions"><button className="cm-button primary" disabled={busy}>{busy?'Salvando...':'Salvar alertas'}</button></div>
   </form>
  </section>
 </div>
}
