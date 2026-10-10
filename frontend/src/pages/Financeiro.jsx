import {useEffect,useMemo,useState} from 'react'
import {comercialGet,dateBR} from '../lib/comercialApi.js'
import {FormControl} from '../components/UiFields.jsx'
import FinanceiroPessoal from './FinanceiroPessoal.jsx'
import './ComercialPages.css'
import './Fechamentos.css'
import './Financeiro.css'

const fmt=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0))
const cents=n=>Math.round(Number(n||0)*100)
const cash=n=>fmt(n/100)
const period=()=>{
  const d=new Date()
  const iso=n=>n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')
  return [iso(new Date(d.getFullYear(),d.getMonth(),1)),iso(new Date(d.getFullYear(),d.getMonth()+1,0))]
}
const typeTitle={comissao:'Comissões e vendas',atendimento:'Atendimentos e participações',
  repasse:'Repasses a vendedores, gerentes e corretores',despesa:'Despesas pessoais',emprestimo:'Empréstimos'}
const typeOrder=['comissao','atendimento','repasse','despesa','emprestimo']

/** Um único extrato visual; os números preservam a origem e não criam novas baixas. */
function buildLedger(accounts,personal){
  const map=new Map()
  function person(id,name){
    const key=String(id)
    if(!map.has(key))map.set(key,{id:key,nome:name||'Minha conta',items:[]})
    return map.get(key)
  }
  for(const account of accounts){
    const record=person(account.pessoa_id,account.nome)
    for(const line of account.itens||[]){
      const own=line.tipo==='TITULAR'
      record.items.push({
        key:'I'+line.operacao_id+'_'+(line.rateio_id||'T'),tipo:own?'comissao':'atendimento',
        direcao:'entrada',titular_nome:account.nome,nome:own?'Minha comissão (após rateios)':line.descricao,
        data:line.data_venda,origem:line.titulo||'Venda #'+line.operacao_id,
        detalhe:line.visita_id?'Atendimento #'+line.visita_id:'',
        total:cents(line.total),recebido:cents(line.recebido),abatido:cents(line.abatido),
        pendente:cents(line.pendente),movimentos:line.movimentos||[],
      })
    }
    for(const line of account.saidas||[]){
      record.items.push({
        key:'R'+line.id,tipo:'repasse',direcao:'saida',titular_nome:account.nome,
        nome:line.beneficiario_nome||'Participante',
        detalhe:(line.origem_corretor_nome?'Venda de '+line.origem_corretor_nome+' · ':'')+({ATENDENTE:'Atendente',GERENTE:'Gerente',CORRETOR:'Corretor'}[line.papel]||'Participação'),
        data:line.data_venda,origem:line.titulo||'Venda #'+line.operacao_id,
        total:cents(line.total),recebido:cents(line.pago),pendente:cents(line.pendente),
      })
    }
  }
  for(const x of personal?.despesas||[]){
    if(x.situacao!=='ATIVA')continue
    person(x.pessoa_id,x.pessoa_nome).items.push({
      key:'D'+x.id,tipo:'despesa',direcao:'saida',titular_nome:x.pessoa_nome,
      nome:x.categoria_nome||'Despesa',detalhe:x.descricao,
      data:x.data_despesa,total:cents(x.valor),pagoIndefinido:true,
    })
  }
  for(const x of personal?.emprestimos||[]){
    if(x.situacao==='CANCELADO')continue
    person(x.pessoa_id,x.pessoa_nome).items.push({
      key:'E'+x.id,tipo:'emprestimo',direcao:'saida',titular_nome:x.pessoa_nome,
      nome:'Saldo do empréstimo #'+x.id,detalhe:x.descricao,
      data:x.data_emprestimo,total:cents(x.saldo),recebido:cents(x.abatido),
      pendente:cents(x.saldo),valor_original:cents(x.valor),abatimentos:x.abatimentos||[],
    })
  }
  return [...map.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
}
function sums(lines){
  return lines.reduce((sum,x)=>{
    if(x.direcao==='entrada'){
      sum.ganhos+=x.total;sum.recebido+=x.recebido;sum.aReceber+=x.pendente;sum.abatido+=x.abatido
    }else if(x.tipo==='repasse'){
      sum.repasses+=x.total;sum.repassesPagos+=x.recebido;sum.repassesPendentes+=x.pendente
    }else if(x.tipo==='despesa')sum.despesas+=x.total
    else if(x.tipo==='emprestimo'){
      sum.emprestimos+=x.total;sum.emprestimosPagos+=x.recebido;sum.emprestimosPendentes+=x.pendente
    }
    return sum
  },{ganhos:0,recebido:0,aReceber:0,abatido:0,repasses:0,repassesPagos:0,
    repassesPendentes:0,despesas:0,emprestimos:0,emprestimosPagos:0,emprestimosPendentes:0})
}
function Line({entry}){
  const [open,setOpen]=useState(false)
  const isIn=entry.direcao==='entrada'
  const hasDetail=(entry.movimentos?.length||0)>0||(entry.abatimentos?.length||0)>0
  return <article className={'finx-entry '+(isIn?'finx-positive':'finx-negative')}>
    <div className="finx-entry-main">
      <span className="finx-arrow" aria-hidden="true">{isIn?'↗':'↘'}</span>
      <div className="finx-entry-text">
        <strong>{entry.nome}</strong>
        {entry.mostrarPessoa&&<small>Conta de: {entry.titular_nome}</small>}
        <small>{entry.data?dateBR(entry.data):'Sem data'}{entry.origem?' · '+entry.origem:''}</small>
        {entry.detalhe&&<small>{entry.detalhe}</small>}
      </div>
      <div className="finx-entry-value">
        <strong>{isIn?'+':'−'} {cash(entry.total)}</strong>
        {entry.pagoIndefinido?<small>Despesa registrada · baixa não informada</small>:
          <small>{entry.tipo==='emprestimo'?'Valor original '+cash(entry.valor_original)+' · Abatido '+cash(entry.recebido||0):
            (isIn?'Recebido ':'Pago ')+cash(entry.recebido||0)+' · '+(isIn?'A receber ':'Pendente ')+cash(entry.pendente||0)}</small>}
        {entry.abatido>0&&<small>Abatido sem dinheiro: {cash(entry.abatido)}</small>}
        {entry.tipo==='emprestimo'&&<small>Saldo atual da dívida; não é despesa deste mês.</small>}
        {entry.tipo==='repasse'&&<small>Controle de pagamentos, não nova despesa sobre comissão já líquida.</small>}
      </div>
    </div>
    {hasDetail&&<div className="finx-entry-extra">
      <button type="button" className="finx-expand" onClick={()=>setOpen(v=>!v)}
        aria-expanded={open}>{open?'Ocultar lançamentos':'Ver lançamentos'}</button>
      {open&&<div className="finx-history">
        {(entry.movimentos||[]).map(m=><div key={'M'+m.id}>
          <span>{m.tipo==='ESTORNO'?'Estorno':'Pagamento'} · {dateBR(m.data)} · {m.forma_nome||'Forma não informada'}</span>
          <b>{m.tipo==='ESTORNO'?'−':'+'}{fmt(m.valor)}</b>
        </div>)}
        {(entry.abatimentos||[]).map(m=><div key={'A'+m.id}>
          <span>Abatimento de empréstimo · {dateBR(m.data_abate)}</span><b>{fmt(m.valor)}</b>
        </div>)}
      </div>}
    </div>}
  </article>
}
function Group({title,items,kind,subheading}){
  const stats=sums(items)
  const positive=kind==='entrada'
  return <section className={'finx-group '+(positive?'finx-group-income':'finx-group-expense')}>
    <header className="finx-group-head">
      <div><h2>{title}</h2>{subheading&&<small>{subheading}</small>}</div>
      <small className="finx-group-count">{items.length} lançamento(s)</small>
    </header>
    {items.slice().sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))).map(x=><Line key={x.key} entry={x}/>)}
  </section>
}

export default function Financeiro({role='admin',initialTab='comissoes'}){
  const admin=role==='admin'
  const personalAllowed=admin||role==='corretor'
  const [tab,setTab]=useState(initialTab==='comissoes'?'extrato':initialTab)
  const [initialStart,initialEnd]=useMemo(period,[])
  const [start,setStart]=useState(initialStart)
  const [end,setEnd]=useState(initialEnd)
  const [selected,setSelected]=useState('')
  const [people,setPeople]=useState([])
  const [groupBy,setGroupBy]=useState('pessoa')
  const [direction,setDirection]=useState('todos')
  const [payload,setPayload]=useState(null)
  const [personal,setPersonal]=useState(null)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [partialError,setPartialError]=useState('')

  useEffect(()=>{
    if(!admin)return undefined
    let active=true
    Promise.all([
      comercialGet('/api/pessoas'),
      comercialGet('/api/fechamentos-periodos/escopos').catch(()=>null),
    ]).then(([data,escopo])=>{
      if(!active)return
      setPeople((data.pessoas||[]).filter(p=>p.ativo))
      const mine=escopo?.pessoa_logada
      // Por padrão, mostre a conta do próprio administrador, nunca a
      // soma dos créditos de todos os corretores como se fossem dele.
      if(mine)setSelected(old=>old||String(mine))
    }).catch(()=>{})
    return ()=>{active=false}
  },[admin])

  useEffect(()=>{
    let active=true
    if(!start||!end||start>end){
      setError('Escolha um período válido.');setBusy(false);return undefined
    }
    setBusy(true);setError('');setPartialError('')
    const params=new URLSearchParams({inicio:start,fim:end})
    if(admin&&selected)params.set('pessoa_id',selected)
    const commission=comercialGet('/api/fechamentos/contas?'+params)
    const other=personalAllowed
      ?comercialGet('/api/financeiro/pessoal?'+params).catch(e=>({falha:e.message}))
      :Promise.resolve(null)
    Promise.all([commission,other]).then(([income,financial])=>{
      if(!active)return
      setPayload(income)
      setPersonal(financial?.falha?null:financial)
      setPartialError(financial?.falha||'')
    }).catch(e=>{if(active){setError(e.message);setPayload(null)}})
      .finally(()=>{if(active)setBusy(false)})
    return ()=>{active=false}
  },[admin,personalAllowed,start,end,selected])

  const allAccounts=payload?.contas||[]
  const ledger=useMemo(()=>buildLedger(allAccounts,personal),[allAccounts,personal])
  const viewed=ledger.filter(a=>!selected||a.id===selected)
  const allLines=viewed.flatMap(a=>a.items)
  const visibleLines=allLines.filter(x=>direction==='todos'||x.direcao===direction)
  const totals=sums(allLines)
  const general=totals.ganhos-totals.despesas
  const allSelected=admin&&!selected
  const tabs=personalAllowed?[['extrato','Extrato geral'],['despesas','Despesas'],['emprestimos','Empréstimos']]:[['extrato','Meu extrato']]
  const options=people.length?people.map(p=>({value:String(p.id),label:p.nome})):
    ledger.map(a=>({value:a.id,label:a.nome}))
  const groups=groupBy==='tipo'
    ?typeOrder.map(type=>({key:type,title:typeTitle[type],
        items:visibleLines.filter(x=>x.tipo===type)})).filter(g=>g.items.length)
    :viewed.map(p=>({key:p.id,title:admin?p.nome:'Minha conta',
        items:p.items.filter(x=>direction==='todos'||x.direcao===direction)}))
      .filter(g=>g.items.length)
  return <div className="com-page fin-page finx-page">
    <header className="com-heading"><div>
      <span className="com-eyebrow">SPLASH / FINANCEIRO</span>
      <h1>{admin?'Extrato financeiro':'Meu extrato financeiro'}</h1>
      <p>{admin?'Créditos pessoais, obrigações e saldos separados por pessoa.':
        personalAllowed?'O que você tem para receber e suas despesas e empréstimos próprios.':
          'Consulte apenas seus valores a receber, já recebidos e pendentes.'}</p>
    </div></header>
    <div className="fin-tabs" role="tablist" aria-label="Áreas financeiras">
      {tabs.map(([key,label])=><button type="button" key={key} role="tab"
        aria-selected={tab===key} className={tab===key?'active':''}
        onClick={()=>setTab(key)}>{label}</button>)}
    </div>
    <section className="com-panel fin-filters">
      <div className="fc-period">
        <label>Data inicial <FormControl type="date" value={start} onChange={setStart}/></label>
        <label>Data final <FormControl type="date" value={end} onChange={setEnd}/></label>
      </div>
      {admin&&<div className="fc-selection"><label>Pessoa
        <FormControl type="select" value={selected} onChange={setSelected}
          options={[{value:'',label:'Todas as pessoas (visão administrativa)'},...options]}/></label></div>}
      {tab==='extrato'&&<div className="finx-filters">
        <label>Agrupar por <FormControl type="select" value={groupBy} onChange={setGroupBy}
          options={[{value:'pessoa',label:'Pessoa'},{value:'tipo',label:'Tipo de entrada / saída'}]}/></label>
        <label>Exibir <FormControl type="select" value={direction} onChange={setDirection}
          options={[{value:'todos',label:'Entradas e saídas'},{value:'entrada',label:'Só entradas'},{value:'saida',label:'Só saídas'}]}/></label>
      </div>}
      <small>Extrato: somente comissões apuradas de vendas integralmente quitadas pela data da venda. O Fechamento mostra comissões brutas das vendas selecionadas e entradas do clube; seus totais não são diretamente comparáveis. Empréstimos mostram saldo atual.</small>
    </section>
    {tab==='extrato'&&<>
      {error&&<div className="com-alert error" role="alert">{error}</div>}
      {partialError&&<div className="com-alert" role="alert">Não foi possível carregar despesas e empréstimos: {partialError}. Os valores gerais abaixo são parciais.</div>}
      {busy&&<section className="com-panel"><div className="com-empty">Carregando extrato financeiro...</div></section>}
      {!busy&&payload&&<>
        <section className="finx-highlights" aria-label="Resumo de direitos e obrigações">
          <div className="finx-tile finx-tile-green"><span>{allSelected?'Créditos de todas as pessoas':'Ganhos e comissões'}</span><strong>{cash(totals.ganhos)}</strong><small>Direitos por titular, sem misturar a propriedade</small></div>
          <div className="finx-tile finx-tile-green"><span>Recebido</span><strong>{cash(totals.recebido)}</strong><small>Dinheiro pago ao beneficiário</small></div>
          <div className="finx-tile finx-tile-green"><span>A receber</span><strong>{cash(totals.aReceber)}</strong><small>Créditos ainda pendentes</small></div>
          {personalAllowed&&<div className="finx-tile finx-tile-red"><span>Despesas registradas</span><strong>{cash(totals.despesas)}</strong><small>Gastos do período</small></div>}
          {personalAllowed&&<div className="finx-tile finx-tile-red"><span>Empréstimos em aberto</span><strong>{cash(totals.emprestimosPendentes)}</strong><small>Já abatido: {cash(totals.emprestimosPagos)}</small></div>}
          {totals.repasses>0&&<div className="finx-tile finx-tile-red"><span>Repasses a fazer</span><strong>{cash(totals.repassesPendentes)}</strong><small>Já repassado: {cash(totals.repassesPagos)}</small></div>}
        </section>
        {payload.possivel_truncamento&&<div className="com-alert">O limite de 500 vendas foi alcançado; reduza o período para evitar valores incompletos.</div>}
        {!groups.length?<section className="com-panel"><div className="com-empty">Nenhum lançamento com esses filtros.</div></section>:
          <div className="finx-groups">
            {groups.map(g=>{
              const positives=g.items.filter(x=>x.direcao==='entrada')
              const negatives=g.items.filter(x=>x.direcao==='saida')
              return <div key={g.key} className="finx-block">
                <header className="finx-block-header"><h2>{g.title}</h2>
                  <small>{g.items.length} lançamento(s)</small></header>
                {positives.length>0&&<Group title="Créditos da pessoa"
                  subheading="Comissões líquidas, atendimentos e participações" kind="entrada"
                  items={positives.map(x=>({...x,mostrarPessoa:allSelected&&groupBy==='tipo'}))}/>}
                {negatives.length>0&&<Group title="Contas a pagar e dívidas"
                  subheading="Repasses operacionais, despesas lançadas e saldos de empréstimos (sem dupla dedução)"
                  kind="saida" items={negatives.map(x=>({...x,mostrarPessoa:allSelected&&groupBy==='tipo'}))}/>}
              </div>
            })}
          </div>}
        <section className="finx-general" aria-label="Resumo geral do extrato">
          <h2>Geral do período</h2>
          <div className="finx-general-grid">
            <div><span>Direitos pessoais apurados</span><strong className="finx-text-green">{cash(totals.ganhos)}</strong></div>
            <div><span>Despesas registradas</span><strong className="finx-text-red">− {cash(totals.despesas)}</strong></div>
            <div><span>Resultado pessoal estimado</span><strong className={general>=0?'finx-text-green':'finx-text-red'}>{cash(general)}</strong></div>
          </div>
          {allSelected&&<p>O total de créditos consolida direitos de pessoas diferentes. Não significa que todos esses valores pertençam ao administrador. Os repasses das vendas dos corretores vinculados aparecem sob quem centraliza os pagamentos.</p>}
          {personalAllowed&&<p>Repasses a terceiros ({cash(totals.repassesPendentes)} pendentes) e saldo de empréstimos ({cash(totals.emprestimosPendentes)}) são exibidos separadamente: não são descontados novamente dos direitos pessoais já líquidos. Abatimentos de dívida também não representam dinheiro recebido.</p>}
          {!personalAllowed&&<p>Recebido, abatido e a receber são situações diferentes da mesma comissão. Não são somados em duplicidade.</p>}
          <p className="finx-fineprint">Valores para conferência gerencial, não saldo bancário. Despesa registrada não comprova pagamento; somente transferências efetivamente registradas são consideradas recebidas ou repassadas.</p>
        </section>
      </>}
    </>}
    {tab!=='extrato'&&personalAllowed&&<FinanceiroPessoal key={tab+'-'+selected}
      role={role} tab={tab} start={start} end={end} initialPerson={selected}/>}
  </div>
}
