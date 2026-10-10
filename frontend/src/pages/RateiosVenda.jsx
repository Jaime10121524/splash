import {useEffect,useState} from 'react'
import {comercialGet,comercialPost,personOptions} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import './RateiosVenda.css'

const cash=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const parseMoney=v=>{
  const raw=String(v??'').trim()
  const val=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw
  return /^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(val)?val:null
}
const roleLabels={ATENDENTE:'Atendimento',GERENTE:'Gerência',CORRETOR:'Segundo corretor'}
const empty=owner=>({responsavel_pessoa_id:String(owner),beneficiario_pessoa_id:'',
  papel:'ATENDENTE',valor:'',observacoes:''})

export default function RateiosVenda({operacaoId,pessoas,onSaved}){
  const [data,setData]=useState(null)
  const [items,setItems]=useState([])
  const [reason,setReason]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function load(){
    const info=await comercialGet('/api/fechamentos/operacoes/'+operacaoId+'/rateios')
    setData(info)
    setItems((info.rateios||[]).map(a=>({
      responsavel_pessoa_id:String(a.responsavel_pessoa_id),
      beneficiario_pessoa_id:String(a.beneficiario_pessoa_id),
      papel:a.papel,valor:String(a.valor),observacoes:a.observacoes||'',
    })))
  }
  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    comercialGet('/api/fechamentos/operacoes/'+operacaoId+'/rateios').then(info=>{
      if(!active)return
      setData(info)
      setItems((info.rateios||[]).map(a=>({
        responsavel_pessoa_id:String(a.responsavel_pessoa_id),
        beneficiario_pessoa_id:String(a.beneficiario_pessoa_id),
        papel:a.papel,valor:String(a.valor),observacoes:a.observacoes||'',
      })))
    }).catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[operacaoId])
  const update=(index,key,value)=>setItems(old=>old.map((row,i)=>i===index?{...row,[key]:value}:row))
  const total=items.reduce((sum,r)=>sum+Math.round(Number(parseMoney(r.valor)||0)*100),0)/100
  const own=Number(data?.comissao_bruta||0)-total
  const roleOptions=role=>personOptions(pessoas||[],role==='ATENDENTE'?['vendedor','corretor']:role==='GERENTE'?['gerente']:['corretor'])
  async function save(e){
    e.preventDefault();setError('');setNotice('')
    if(!data?.editavel)return setError('Esta venda não permite alteração de rateio.')
    if(reason.trim().length<5)return setError('Explique o motivo do ajuste com pelo menos 5 caracteres.')
    const clean=[]
    for(let i=0;i<items.length;i++){
      const r=items[i],value=parseMoney(r.valor)
      if(!r.beneficiario_pessoa_id||!r.responsavel_pessoa_id||value===null||Number(value)<=0){
        return setError('Confira pessoa, origem e valor da participação '+(i+1)+'.')
      }
      clean.push({...r,valor:value,responsavel_pessoa_id:Number(r.responsavel_pessoa_id),
        beneficiario_pessoa_id:Number(r.beneficiario_pessoa_id)})
    }
    setBusy(true)
    try{
      const result=await comercialPost('/api/fechamentos/operacoes/'+operacaoId+'/rateios',{
        itens:clean,justificativa:reason.trim(),
      })
      setNotice(result.message||'Participações atualizadas.')
      setReason('')
      await load()
      if(onSaved)await onSaved()
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  return <section className="rv-box">
    <header><h3>Participações desta venda</h3>
      <p>Confira o atendimento, a gerência e a parte do corretor. Estes valores irão para o Financeiro e para o fechamento. Não registra pagamentos.</p></header>
    {loading&&<div className="com-empty">Carregando participações...</div>}
    {error&&<div className="com-alert error" role="alert">{error}</div>}
    {notice&&<div className="com-alert success" role="status">{notice}</div>}
    {data&&!loading&&<>
      <div className="rv-summary">
        <span>Comissão bruta <strong>{cash(data.comissao_bruta)}</strong></span>
        <span>Outras participações <strong>{cash(total)}</strong></span>
        <span>Parte própria do corretor <strong>{cash(own)}</strong></span>
      </div>
      {data.aviso&&<p className="rv-note">{data.aviso}</p>}
      <form onSubmit={save} className="rv-form">
        {items.map((r,index)=><div key={index} className="rv-row">
          <div className="rv-row-top"><strong>Participação {index+1}</strong>
            {data.editavel&&<button type="button" className="vd-outline"
              onClick={()=>setItems(old=>old.filter((_,i)=>i!==index))}>Remover</button>}</div>
          <div className="rv-fields">
            <label>Função <FormControl type="select" value={r.papel} disabled={!data.editavel}
              onChange={v=>setItems(old=>old.map((item,i)=>i===index?{...item,papel:v,beneficiario_pessoa_id:''}:item))}
              options={[{value:'ATENDENTE',label:'Atendimento'},{value:'GERENTE',label:'Gerência'},{value:'CORRETOR',label:'Corretor'}]}/></label>
            <label>Quem recebe <FormControl type="select" disabled={!data.editavel} value={r.beneficiario_pessoa_id}
              onChange={v=>update(index,'beneficiario_pessoa_id',v)}
              options={roleOptions(r.papel)} placeholder="Selecione a pessoa"/></label>
            <label>Valor (R$) <input required disabled={!data.editavel} inputMode="decimal"
              value={r.valor} onChange={e=>update(index,'valor',e.target.value)}/></label>
            <label>Participação paga por <FormControl type="select" disabled={!data.editavel}
              value={r.responsavel_pessoa_id} onChange={v=>update(index,'responsavel_pessoa_id',v)}
              options={personOptions(pessoas||[],['corretor','gerente','vendedor'])}/></label>
          </div>
          {data.editavel&&<label>Observação <input value={r.observacoes} maxLength={500}
            onChange={e=>update(index,'observacoes',e.target.value)}
            placeholder="Ex.: valor arredondado pelo clube"/></label>}
        </div>)}
        {data.editavel&&<>
          <button type="button" className="vd-outline rv-add" onClick={()=>setItems(old=>[...old,empty(data.corretor_pessoa_id)])}>＋ Adicionar participação</button>
          <label>Motivo da conferência / correção
            <textarea required minLength={5} maxLength={500} rows={2} value={reason}
              onChange={e=>setReason(e.target.value)}
              placeholder="Ex.: atendimento arredondado para R$ 60 e bônus à vista"/></label>
          <div className="rv-actions"><button type="submit" className="com-main-button"
            disabled={busy||own<0}>{busy?'Salvando...':'Salvar participações'}</button></div>
        </>}
      </form>
    </>}
  </section>
}
