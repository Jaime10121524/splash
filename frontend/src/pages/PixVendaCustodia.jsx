import {useEffect,useMemo,useState} from 'react'
import {comercialGet,comercialPost,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import {SurfaceModal} from '../components/ComercialForms.jsx'
import './PixVendaCustodia.css'

const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0))
const newKey=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'_'+Math.random().toString(36).slice(2,16)
const blank=()=>({modo:'NOVO',movimento_custodia_id:'',referencia:'',observacoes:'',
  confirmado_sem_duplicidade:false,confirmado_posse_responsavel:false})
const norm=s=>String(s||'').toLocaleLowerCase('pt-BR')

export default function PixVendaCustodia({fechamentoId,responsavelNome,onChanged}){
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState(null)
  const [modal,setModal]=useState(null)
  const [form,setForm]=useState(blank)
  const [key,setKey]=useState(newKey)
  const [reason,setReason]=useState('')

  async function refresh(){
    const response=await comercialGet('/api/fechamentos-periodos/'+fechamentoId+'/conciliacao/pix')
    setResult(response)
  }
  useEffect(()=>{
    let active=true
    setLoading(true);setResult(null);setError('')
    comercialGet('/api/fechamentos-periodos/'+fechamentoId+'/conciliacao/pix')
      .then(r=>{if(active)setResult(r)})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[fechamentoId])

  const candidates=result?.candidatos||[]
  const available=useMemo(()=>candidates.filter(x=>!x.ja_vinculado
    && (!search||norm(x.titulo+' '+x.corretor_nome+' '+x.operacao_id+' '+x.id).includes(norm(search)))),[candidates,search])
  const manuals=result?.movimentos_manuais_livres||[]
  function open(item){
    const matching=manuals.filter(m=>Math.round(Number(m.valor)*100)===Math.round(Number(item.valor_disponivel)*100))
    setSelected(item);setKey(newKey());setError('')
    setForm({...blank(),modo:matching.length?'EXISTENTE':'NOVO',
      movimento_custodia_id:matching.length?String(matching[0].id):''})
    setModal('link')
  }
  function reverse(item){setSelected(item);setReason('');setError('');setModal('reverse')}
  async function save(e){
    e.preventDefault()
    if(!selected||!form.confirmado_sem_duplicidade||!form.confirmado_posse_responsavel){
      return setError('Confirme que o dinheiro está sob a custódia do responsável e que não foi contado antes.')
    }
    if(form.observacoes.trim().length<10)return setError('Explique a conferência em pelo menos dez caracteres.')
    if(form.modo==='NOVO'&&form.referencia.trim().length<3){
      return setError('Informe a referência do comprovante Pix.')
    }
    if(form.modo==='EXISTENTE'&&!form.movimento_custodia_id){
      return setError('Escolha o lançamento manual existente.')
    }
    setBusy(true);setError('')
    try{
      const resultAction=await comercialPost('/api/fechamentos-periodos/'+fechamentoId+'/conciliacao/pix/vincular',{
        ...form,recebimento_id:Number(selected.id),
        movimento_custodia_id:form.modo==='EXISTENTE'?Number(form.movimento_custodia_id):null,
        referencia:form.referencia.trim(),observacoes:form.observacoes.trim(),chave_requisicao:key,
      })
      await refresh()
      if(onChanged)await onChanged()
      setNotice(resultAction.message);setModal(null)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  async function undo(e){
    e.preventDefault()
    if(reason.trim().length<10)return setError('Informe o motivo da correção (mínimo dez caracteres).')
    setBusy(true);setError('')
    try{
      const resultAction=await comercialPost('/api/fechamentos-periodos/'+fechamentoId+
        '/conciliacao/pix/'+selected.id+'/desvincular',{justificativa:reason.trim()})
      await refresh()
      if(onChanged)await onChanged()
      setNotice(resultAction.message);setModal(null)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  const matching=selected?manuals.filter(m=>Math.round(Number(m.valor)*100)===Math.round(Number(selected.valor_disponivel)*100)):[]
  const shown=available.slice(0,100)
  return <section className="cust-pix" aria-label="Conciliação de Pix por venda">
    <header className="cust-pix-header">
      <div><h3>Identificar Pix antigos pelas vendas</h3>
        <p>O sistema identifica Pix registrados e ainda disponíveis nas vendas deste grupo. Identificação não movimenta o caixa: confirme a origem antes de associar.</p></div>
      <strong>{available.length} pendente(s) de análise</strong>
    </header>
    {loading&&<div className="com-empty">Buscando Pix registrados...</div>}
    {error&&!modal&&<p className="com-alert error" role="alert">{error}</p>}
    {notice&&<p className="com-alert success" role="status">{notice}</p>}
    {result&&<>
      {result.possivel_truncamento&&<p className="com-alert">A consulta está limitada aos 500 Pix mais recentes do grupo. Os mais antigos não aparecem nesta lista.</p>}
      <p className="cust-help">A indicação “Com o corretor” na venda não prova que o dinheiro esteja na conta de {responsavelNome}. Confirme o comprovante e onde o dinheiro realmente está. Se já lançou o valor manualmente, use “Associar ao lançamento existente” — nunca some o mesmo Pix duas vezes.</p>
      <label className="cust-pix-search">Pesquisar título, venda ou corretor
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Digite para filtrar os Pix pendentes"/></label>
      {available.length===0?<div className="com-empty">Nenhum Pix elegível pendente nesta consulta.</div>:
        <div className="cust-pix-items">{shown.map(item=><article key={item.id}>
          <div><strong>{item.titulo||'Venda #'+item.operacao_id}</strong>
            <small>Venda #{item.operacao_id} · Recebimento #{item.id} · {item.corretor_nome}</small>
            <small>{dateBR(item.data)} · Original {money(item.valor_original)} · Disponível {money(item.valor_disponivel)}</small></div>
          <button type="button" className="vd-outline" onClick={()=>open(item)}>Conferir Pix</button>
        </article>)}</div>}
      {available.length>100&&<p className="cust-help">Exibindo os primeiros 100 resultados. Use a pesquisa para localizar outro lançamento.</p>}
      <h4>Pix já conciliados neste fechamento</h4>
      {(result.vinculos||[]).length===0?<div className="com-empty">Nenhum Pix de venda foi vinculado ainda.</div>:
        <div className="cust-pix-items">{result.vinculos.map(item=><article key={item.id}>
          <div><strong>Recebimento #{item.recebimento_id} · {money(item.valor)}</strong>
            <small>{item.modo==='EXISTENTE'?'Associado a lançamento manual, sem novo crédito':'Entrada reconhecida sob custódia'} · {item.situacao==='ATIVO'?'Ativo':'Estornado'}</small>
            {item.divergente&&<small className="cust-pix-warning">Atenção: valor disponível na venda passou a {money(item.valor_atual)}. Confira devoluções e reconcilie a diferença.</small>}
            {item.motivo_estorno&&<small>Motivo do estorno: {item.motivo_estorno}</small>}</div>
          {item.situacao==='ATIVO'&&<button type="button" className="vd-outline" onClick={()=>reverse(item)}>Desfazer vínculo</button>}
        </article>)}</div>}
    </>}
    {modal&&<SurfaceModal eyebrow="SPLASH / PIX"
      title={modal==='link'?'Conciliar Pix da venda':'Desfazer vínculo do Pix'}
      busy={busy} onClose={()=>!busy&&setModal(null)}>
      {modal==='link'&&selected&&<form className="fpw-modal-form" onSubmit={save}>
        <p className="cust-help"><strong>{selected.titulo}</strong> · Corretor: {selected.corretor_nome} ·
          Pix registrado {dateBR(selected.data)} · Disponível {money(selected.valor_disponivel)}.</p>
        <label>Como este Pix deve ser conciliado? *
          <FormControl type="select" value={form.modo}
            onChange={v=>setForm(s=>({...s,modo:v,movimento_custodia_id:v==='EXISTENTE'?String(matching[0]?.id||''):''}))}
            options={[{value:'NOVO',label:'Reconhecer valor ainda não lançado'},
              ...(matching.length?[{value:'EXISTENTE',label:'Associar ao lançamento de custódia existente'}]:[])]}/></label>
        {form.modo==='EXISTENTE'?<label>Lançamento já registrado *
          <FormControl type="select" value={form.movimento_custodia_id}
            onChange={v=>setForm(s=>({...s,movimento_custodia_id:v}))}
            options={matching.map(m=>({value:String(m.id),label:'#'+m.id+' · '+money(m.valor)+' · Ref. '+m.referencia}))}/></label>:
          <label>Referência do comprovante Pix *
            <input value={form.referencia} maxLength={100} required
              placeholder="Identificador da transferência / comprovante"
              onChange={e=>setForm(s=>({...s,referencia:e.target.value}))}/></label>}
        <label>Justificativa / conferência *
          <textarea rows={3} maxLength={400} required minLength={10}
            value={form.observacoes} onChange={e=>setForm(s=>({...s,observacoes:e.target.value}))}
            placeholder="De quem foi recebido, quem tem o dinheiro e qual comprovante foi conferido."/></label>
        <label className="cust-pix-check">
          <input type="checkbox" checked={form.confirmado_posse_responsavel}
            onChange={e=>setForm(s=>({...s,confirmado_posse_responsavel:e.target.checked}))}/>
          Confirmo que este dinheiro está efetivamente sob a custódia de {responsavelNome}.
        </label>
        <label className="cust-pix-check">
          <input type="checkbox" checked={form.confirmado_sem_duplicidade}
            onChange={e=>setForm(s=>({...s,confirmado_sem_duplicidade:e.target.checked}))}/>
          Verifiquei que o valor não está duplicado entre recebimentos do clube, saldo anterior e outras entradas de custódia.
        </label>
        <p className="cust-help">O vínculo não paga comissão da Marta, Helena ou de qualquer participante. A baixa continua sendo feita exclusivamente em Pagamentos.</p>
        <div className="fpw-actions"><button type="button" className="vd-outline" disabled={busy} onClick={()=>setModal(null)}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Confirmar vínculo</button></div>
      </form>}
      {modal==='reverse'&&selected&&<form className="fpw-modal-form" onSubmit={undo}>
        <p className="cust-help">O recebimento #{selected.recebimento_id} continuará no extrato da venda. Se o valor foi criado por esta conciliação, a entrada de custódia também será estornada; se era manual, continuará no livro de caixa.</p>
        <label>Motivo do estorno *
          <textarea rows={3} required minLength={10} maxLength={500} value={reason}
            onChange={e=>setReason(e.target.value)}/></label>
        <div className="fpw-actions"><button type="button" className="vd-outline" disabled={busy} onClick={()=>setModal(null)}>Cancelar</button>
          <button type="submit" className="cm-button primary" disabled={busy}>Confirmar correção</button></div>
      </form>}
      {error&&<p className="com-alert error" role="alert">{error}</p>}
    </SurfaceModal>}
  </section>
}
