import { useEffect, useState } from 'react'
import './App.css'
import Planos from './pages/Planos.jsx'
import PessoasUsuarios from './pages/PessoasUsuarios.jsx'
import Clientes from './pages/Clientes.jsx'
import Atendimentos from './pages/Atendimentos.jsx'
import OrigensMotivos from './pages/OrigensMotivos.jsx'
import Vendas from './pages/Vendas.jsx'
import FechamentosPeriodos from './pages/FechamentosPeriodos.jsx'
import Financeiro from './pages/Financeiro.jsx'
import RegrasComissoes from './pages/RegrasComissoes.jsx'
import Relatorios from './pages/Relatorios.jsx'

const paths = {
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10'],
  clipboard: ['M9 3h6l1 2h3v16H5V5h3z', 'M9 3a2 2 0 0 0 0 4h6a2 2 0 0 0 0-4', 'M9 12h6','M9 16h6'],
  bag: ['M4 7h16l-1 14H5L4 7z', 'M9 9V6a3 3 0 0 1 6 0v3'],
  wallet: ['M3 7V5a2 2 0 0 1 2-2h15v4','M3 7h18v14H3z','M16 12h5v5h-5a2.5 2.5 0 0 1 0-5z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20', 'M12 6v6l4 2'],
  arrows: ['M7 7h14l-4-4', 'M21 7l-4 4', 'M17 17H3l4 4','M3 17l4-4'],
  calendar: ['M3 5h18v16H3z', 'M7 3v4','M17 3v4','M3 10h18'],
  chart: ['M3 3v18h18','M7 16l4-5 3 2 6-7'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7','M19.4 15a8 8 0 0 0 .1-6l2-1.5-2-3.4-2.3 1A8.3 8.3 0 0 0 12 3l-.4-2H8l-.3 2.4a9 9 0 0 0-3.1 1.8l-2.3-1-2 3.4 2 1.5a8 8 0 0 0 0 6l-2 1.5 2 3.4 2.3-1A9 9 0 0 0 8 21l.3 2.1h3.5l.3-2.1a8 8 0 0 0 5.1-2.1l2.3 1 2-3.4z'],
  chevron: ['M9 18l6-6-6-6'],
  chevrondown: ['M6 9l6 6 6-6'],
  plus: ['M12 5v14','M5 12h14'],
  arrow: ['M5 12h14','M13 6l6 6-6 6'],
  menu: ['M4 6h16','M4 12h16','M4 18h16'],
  close: ['M6 6l12 12','M18 6L6 18'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9','M10 21h4'],
  sun: ['M12 2v2','M12 20v2','M4.93 4.93l1.41 1.41','M17.66 17.66l1.41 1.41','M2 12h2','M20 12h2','M4.93 19.07l1.41-1.41','M17.66 6.34l1.41-1.41','M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  moon: ['M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5'],
  logout: ['M10 17l5-5-5-5','M15 12H3','M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z','M9 12l2 2 4-4'],
  eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z','M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  eyeoff: ['M3 3l18 18','M10.5 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a13 13 0 0 1-3.5 4.2','M6.2 6.2C3.4 8 2 12 2 12s3.5 6 10 6a11 11 0 0 0 4-0.7'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16','M21 21l-4.3-4.3'],
  file: ['M5 2h10l5 5v15H5z','M14 2v6h6','M9 13h7','M9 17h7'],
  alert: ['M12 3L2 21h20z','M12 9v5','M12 18h.01'],
  check: ['M5 12l4 4L19 6'],
  refresh: ['M20 11a8 8 0 0 0-14-5L3 9','M3 4v5h5','M4 13a8 8 0 0 0 14 5l3-3','M21 20v-5h-5'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20','M12 11v6','M12 7h.01'],
  spark: ['M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z'],
  receipt: ['M5 3h14v18l-3-2-4 2-4-2-3 2z','M9 9h6','M9 13h6'],
  more: ['M5 12h.01','M12 12h.01','M19 12h.01'],
  key: ['M14 7a5 5 0 1 0-4.5 8l-2.5 2.5V21H3v-4l5-5','M16 8h.01'],
  tag: ['M20 13l-7 7-11-11V2h7z','M7 7h.01'],
}

function Icon({ name, size = 20, stroke = 1.8, ...props }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {(paths[name] || paths.grid).map((d, i) => <path key={i} d={d} />)}
  </svg>
}

const nav = [
  { id: 'dashboard', label: 'Visão geral', icon: 'grid', roles: ['admin','corretor','vendedor','gerente','operador'], section: 'Principal' },
  { id: 'atendimentos', label: 'Atendimentos', icon: 'clipboard', roles: ['admin','operador'], section: 'Operação' },
  { id: 'planos', label: 'Planos', icon: 'tag', roles: ['admin'], section: 'Operação' },
  { id: 'pessoas', label: 'Pessoas', icon: 'users', roles: ['admin'], section: 'Operação' },
  { id: 'clientes', label: 'Clientes', icon: 'users', roles: ['admin','operador'], section: 'Operação' },
  { id: 'vendas', label: 'Vendas', icon: 'bag', roles: ['admin','corretor','vendedor','gerente'], section: 'Operação' },
  { id: 'pendencias', label: 'Pendências', icon: 'clock', roles: ['admin'], section: 'Operação' },
  { id: 'titulos', label: 'Títulos e renovações', icon: 'calendar', roles: ['admin','corretor'], section: 'Operação' },
  { id: 'financeiro', label: 'Financeiro', icon: 'wallet', roles: ['admin','corretor','vendedor','gerente'], section: 'Gestão' },
  { id: 'despesas', label: 'Minhas despesas', icon: 'receipt', roles: ['corretor'], section: 'Gestão' },
  { id: 'emprestimos', label: 'Meus empréstimos', icon: 'arrows', roles: ['corretor'], section: 'Gestão' },
  { id: 'fechamentos', label: 'Fechamentos', icon: 'arrows', roles: ['admin','corretor'], section: 'Gestão' },
  { id: 'relatorios', label: 'Relatórios', icon: 'chart', roles: ['admin','corretor','vendedor','gerente'], section: 'Gestão' },
  { id: 'usuarios', label: 'Usuários', icon: 'shield', roles: ['admin'], section: 'Sistema' },
  { id: 'origens', label: 'Origens e motivos', icon: 'tag', roles: ['admin'], section: 'Sistema' },
  { id: 'configuracoes', label: 'Configurações', icon: 'settings', roles: ['admin'], section: 'Sistema' },
]
const descriptions = {
  atendimentos: 'Organize chegadas, atendentes e resultados de cada visita.',
  planos: 'Gerencie códigos, valores, prazos e versões históricas dos planos.',
  pessoas: 'Cadastre corretores, gerentes e atendentes com múltiplos papéis.',
  usuarios: 'Gerencie login e permissões dos participantes.',
  origens: 'Configure as origens dos leads e motivos de não venda.',
  clientes: 'Histórico do associado, contatos e vínculo com a corrente.',
  vendas: 'Acompanhe suas vendas, participantes e comissões.',
  pendencias: 'Retornos, antecipações e pagamentos pendentes.',
  titulos: 'Validades, renovações e upgrades de títulos.',
  financeiro: 'Sua conta-corrente, comissões, saldos e movimentações.',
  despesas: 'Controle individual de gastos e bonificações.',
  emprestimos: 'Empréstimos com o clube e amortizações negociadas.',
  fechamentos: 'Apuração centralizada e acertos individuais.',
  relatorios: 'Demonstrativos e consultas para exportação em PDF.',
  configuracoes: 'Cadastros gerais, regras e permissões.'
}

function Brand({ small = false }) {
  return <div className={'brand ' + (small ? 'brand-small' : '')}>
    <span className="brand-emblem"><span /><span /><span /></span>
    <span className="brand-name">splash<span className="brand-stop">.</span></span>
  </div>
}
function formatToday() {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}
function roleLabel(role) {
  return ({ admin: 'Administrador', corretor: 'Corretor', vendedor: 'Vendedor', gerente: 'Gerente', restrito: 'Acesso restrito' })[role] || 'Usuário'
}
function initials(value) {
  return (value || 'S').split(/[ ._-]+/).filter(Boolean).slice(0,2).map(s => s[0].toUpperCase()).join('')
}
async function getJSON(url, opts = {}) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json', ...(opts.headers || {}) }, ...opts })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.message || 'Não foi possível concluir a operação.'), { data, status: response.status })
  return data
}

function Login({ onLogin, error, busy, offline, onRetry }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (username.trim() && password) await onLogin(username.trim(), password)
  }
  return <div className="auth-page">
    <section className="auth-story" aria-label="Apresentação do Splash">
      <div className="auth-story-top"><Brand /><span className="auth-tag">Gestão inteligente</span></div>
      <div className="auth-story-copy">
        <span className="story-overline"><Icon name="spark" size={16}/> O seu negócio, em movimento</span>
        <h2>Da primeira visita ao último acerto. <em>Tudo conectado.</em></h2>
        <p>Mais clareza para acompanhar vendas, comissões, pendências e o financeiro de cada corretor.</p>
        <div className="story-chips"><span>Atendimentos</span><span>Comissões</span><span>Fechamentos</span></div>
      </div>
      <div className="auth-orbit" aria-hidden="true"><i/><i/><i/><b/></div>
      <div className="auth-story-footer">Uma experiência Ahritech</div>
    </section>
    <main className="auth-form-side">
      <div className="auth-mobile-brand"><Brand /></div>
      <div className="auth-form-wrap">
        <div className="auth-welcome"><span className="eyebrow">BEM-VINDO AO SPLASH</span><h1>Entre na sua conta</h1><p>Acesse seu espaço de trabalho com segurança.</p></div>
        {offline && <div className="feedback error" role="alert"><Icon name="alert" size={18}/><span>{error || 'Não foi possível comunicar com o CodeIgniter. Verifique se o servidor está ativo na porta 8080.'}</span><button type="button" className="inline-button" onClick={onRetry}>Tentar novamente</button></div>}
        {error && !offline && <div className="feedback error" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div>}
        <form onSubmit={submit} className="auth-fields">
          <label htmlFor="username">Nome de usuário</label>
          <div className="input-wrap"><Icon name="user" size={19}/><input id="username" autoComplete="username" placeholder="Digite seu usuário" value={username} onChange={e => setUsername(e.target.value)} required maxLength={100}/></div>
          <div className="label-line"><label htmlFor="password">Senha</label><a href="/login/magic-link">Esqueceu a senha?</a></div>
          <div className="input-wrap"><Icon name="key" size={19}/><input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={e => setPassword(e.target.value)} required/><button className="input-eye" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}><Icon name={visible?'eyeoff':'eye'} size={19}/></button></div>
          <button type="submit" className="button primary signin" disabled={busy || offline}>{busy ? 'Entrando...' : 'Acessar sistema'}<Icon name="arrow" size={19}/></button>
        </form>
        <div className="security-foot"><Icon name="shield" size={17}/><span>Seu acesso é individual e protegido.</span></div>
      </div>
      <div className="auth-copy">© {new Date().getFullYear()} SPLASH · Ahritech</div>
    </main>
  </div>
}

function Sidebar({ user, current, navigate, open, close, logout }) {
  const permitted = nav.filter(item => item.roles.includes(user.role))
  const sections = [...new Set(permitted.map(item => item.section))]
  return <>
    {open && <button aria-label="Fechar menu" className="drawer-scrim" onClick={close}/>}
    <aside className={'sidebar ' + (open ? 'is-open' : '')}>
      <div className="sidebar-logo"><Brand/><button className="icon-btn close-sidebar" onClick={close} aria-label="Fechar menu"><Icon name="close"/></button></div>
      <div className="sidebar-scroll">
        {sections.map(section => <div className="sidebar-section" key={section}>
          <p className="sidebar-caption">{section}</p>
          <nav aria-label={section}>
            {permitted.filter(item => item.section === section).map(item => <button type="button" key={item.id} className={'side-link ' + (current === item.id ? 'active' : '')} aria-current={current===item.id ? 'page' : undefined} onClick={() => {navigate(item.id);close()}}><Icon name={item.icon} size={19}/><span>{item.label}</span>{current===item.id && <span className="active-indicator"/>}</button>)}
          </nav>
        </div>)}
      </div>
      <div className="sidebar-bottom">
        <div className="account-mini"><span className="avatar">{initials(user.username)}</span><div><strong>{user.username}</strong><small>{roleLabel(user.role)}</small></div></div>
        <button className="logout-link" onClick={logout}><Icon name="logout" size={18}/> Sair da conta</button>
      </div>
    </aside>
  </>
}

function NoData({ icon = 'clipboard', title = 'Nenhum registro por enquanto', description = 'Os dados aparecerão aqui assim que o módulo estiver disponível.' }) {
  return <div className="no-data"><span className="no-data-icon"><Icon name={icon} size={28}/></span><strong>{title}</strong><p>{description}</p></div>
}
function DataCard({ label, icon, tone, detail, value = '—' }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={'stat-icon ' + (tone || '')}><Icon name={icon} size={19}/></span></div><strong className="stat-value">{value}</strong><div className="stat-foot"><span className="mini-dot"/> {detail || 'Aguardando dados do módulo'}</div></div>
}
function Dashboard({ user, navigate }) {
  const admin=user.role==='admin'
  const operator=user.role==='operador'
  const [refresh,setRefresh]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [stats,setStats]=useState({})
  const [activities,setActivities]=useState([])
  const [period,setPeriod]=useState('')
  useEffect(()=>{
    let active=true
    const now=new Date()
    const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
    const start=iso(new Date(now.getFullYear(),now.getMonth(),1))
    const end=iso(new Date(now.getFullYear(),now.getMonth()+1,0))
    const query='?'+new URLSearchParams({inicio:start,fim:end})
    setPeriod(new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(now))
    setLoading(true);setError('')
    const requests=operator?[]:[
      ['contas',getJSON('/api/fechamentos/contas'+query)],
      ['pessoal',getJSON('/api/financeiro/pessoal'+query)],
    ]
    if(admin){
      requests.push(['vendas',getJSON('/api/vendas/resumo')])
      requests.push(['visitas',getJSON('/api/atendimentos'+query)])
    }else if(user.role==='operador'){
      requests.push(['visitas',getJSON('/api/atendimentos'+query)])
    }
    Promise.allSettled(requests.map(([,req])=>req)).then(results=>{
      if(!active)return
      const values={}
      results.forEach((res,i)=>{if(res.status==='fulfilled')values[requests[i][0]]=res.value})
      const accounts=values.contas?.contas||[]
      const own=admin?accounts:accounts.slice(0,1)
      const sum=(items,fn)=>items.reduce((n,x)=>n+Number(fn(x)||0),0)
      const commission=sum(own,a=>a.resumo.total)
      const paid=sum(own,a=>a.resumo.recebido)
      const offsets=sum(own,a=>a.resumo.abatido)
      const pending=sum(own,a=>a.resumo.pendente)
      setStats({
        visits:values.visitas?.indicadores?.total,
        sales:values.vendas?.vendas,
        pendingSales:values.vendas?.pendencias,
        commission:values.contas?commission:undefined,
        received:values.contas?paid:undefined,
        offset:values.contas?offsets:undefined,
        due:values.contas?pending:undefined,
        expenses:values.pessoal?.resumo?.despesas_periodo,
        loans:values.pessoal?.resumo?.saldo_emprestimos,
        acertos:values.contas?.acertos?.length,
      })
      const recent=accounts.flatMap(a=>(a.itens||[]).map(item=>({
        id:a.pessoa_id+'-'+item.operacao_id+'-'+(item.rateio_id||0)+'-'+item.tipo,
        nome:admin?a.nome:'Minha comissão',
        descricao:item.descricao,
        titulo:item.titulo,
        data:item.data_venda,
        total:item.total,
        saldo:item.pendente,
      }))).sort((x,y)=>(y.data||'').localeCompare(x.data||'')).slice(0,6)
      setActivities(recent)
      if(results.every(x=>x.status==='rejected'))setError('Não foi possível carregar os indicadores. Verifique o backend e tente novamente.')
      else if(results.some(x=>x.status==='rejected'))setError('Alguns indicadores não foram carregados; os demais estão atualizados.')
    }).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[admin,operator,user.role,refresh])
  const money=v=>v===undefined?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0))
  const number=v=>v===undefined?'—':v
  return <>
    <div className="welcome-row"><div><span className="eyebrow">VISÃO GERAL</span><h1>Olá, {user.username}! <span className="wave">✳</span></h1>
      <p>Indicadores de {period||'sua operação'}, atualizados a partir dos registros reais.</p></div>
      <div className="today-pill"><Icon name="calendar" size={17}/>{formatToday()}</div></div>
    <div className="hero-panel">
      <div className="hero-copy"><span className="hero-pill"><Icon name="spark" size={15}/> PAINEL SPLASH</span>
        <h2>{admin?'Operação e resultados em um só lugar.':operator?'Acompanhe chegadas e atendimentos.':'Acompanhe suas comissões e pagamentos.'}</h2>
        <p>{admin?'Vendas, visitas, comissões e acertos por pessoa, sem misturar os responsáveis.':
          operator?'Registre chegadas e acompanhe os atendimentos do clube.':'Veja suas comissões, quanto recebeu e o que continua pendente.'}</p>
        <div className="hero-actions"><button type="button" className="button light"
          onClick={()=>navigate(admin?'fechamentos':operator?'atendimentos':'financeiro')}>{admin?'Ver fechamentos':operator?'Atendimentos':'Meu financeiro'}<Icon name="arrow" size={18}/></button>
          <button type="button" className="button light" onClick={()=>setRefresh(v=>v+1)} disabled={loading}>
            <Icon name="refresh" size={16}/>{loading?'Atualizando':'Atualizar dados'}</button></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="hero-ring ring-one"/><div className="hero-ring ring-two"/><div className="hero-bubble main-bubble"><Icon name="chart" size={43}/></div><div className="hero-bubble small-bubble"><Icon name="check" size={28}/></div></div>
    </div>
    <div className="section-heading"><div><h2>Resumo {admin?'da operação':'pessoal'}</h2>
      <p>Período: {period||'mês atual'}. Pagamentos referem-se às vendas do período, mesmo que feitos depois.</p></div>
      <span className="hint-badge">{loading?'Atualizando…':error?'Dados parciais':'Dados conectados'}</span></div>
    {error&&<div className="com-alert error" role="status">{error}</div>}
    <div className="stats-grid">
      {(admin||operator)&&<>
        <DataCard label="Visitas no período" icon="users" tone="violet" detail="Chegadas registradas" value={loading?'…':number(stats.visits)}/>
        {admin&&<>
          <DataCard label="Vendas cadastradas" icon="bag" tone="mint" detail="Total histórico do clube" value={loading?'…':number(stats.sales)}/>
          <DataCard label="Pendências de negociação" icon="clock" tone="amber" detail="Total histórico em aberto" value={loading?'…':number(stats.pendingSales)}/>
        </>}
      </>}
      {!operator&&<><DataCard label={admin?'Comissões das contas':'Minhas comissões'} icon="wallet" tone="violet"
        detail="Direitos apurados no mês" value={loading?'…':money(stats.commission)}/>
      <DataCard label="Recebido em pagamentos" icon="check" tone="mint"
        detail="Baixas efetivamente registradas" value={loading?'…':money(stats.received)}/>
      <DataCard label="Ainda falta receber" icon="clock" tone="amber"
        detail="Saldo sem baixa no financeiro" value={loading?'…':money(stats.due)}/>
      <DataCard label="Abatido em empréstimos" icon="arrows" tone="sky"
        detail="Compensação de dívida, não dinheiro recebido" value={loading?'…':money(stats.offset)}/>
      <DataCard label="Despesas no mês" icon="receipt" tone="amber"
        detail="Despesas pessoais registradas" value={loading?'…':money(stats.expenses)}/>
      <DataCard label="Saldo de empréstimos" icon="wallet" tone="sky"
        detail="Valor ainda devido ao clube" value={loading?'…':money(stats.loans)}/></>}
    </div>
    <div className={'dashboard-columns'+(operator?' dashboard-operator':'')}>
      {!operator&&<section className="panel activity-panel"><div className="panel-head"><div><h3>Comissões recentes</h3>
        <p>Últimos direitos apurados nas vendas do período</p></div></div>
        {activities.length===0?<NoData icon="chart" title="Sem lançamentos no período"
          description="Cadastre e apure uma venda para visualizar seus resultados."/>:
          <div className="splash-activity-list">{activities.map(a=><div className="splash-activity-item" key={a.id}>
            <div><strong>{a.nome} · {a.descricao}</strong>
              <small>{a.titulo||'Venda #'+a.id} · {a.data?new Date(a.data+'T12:00:00').toLocaleDateString('pt-BR'):''}</small></div>
            <div><strong>{money(a.total)}</strong><small>Falta {money(a.saldo)}</small></div>
          </div>)}</div>}
      </section>}
      <section className="panel quick-panel"><div className="panel-head"><div><h3>Acesso rápido</h3>
        <p>Abra diretamente a função desejada</p></div></div>
        <div className="quick-links">
          {(admin?[
            {label:'Atendimentos',detail:'Acompanhar visitantes',id:'atendimentos',icon:'clipboard'},
            {label:'Vendas',detail:'Consultar negociações',id:'vendas',icon:'bag'},
            {label:'Fechamentos',detail:'Acertos por pessoa e empréstimos',id:'fechamentos',icon:'wallet'},
            {label:'Financeiro',detail:'Despesas e empréstimos',id:'financeiro',icon:'receipt'},
          ]:operator?[
            {label:'Atendimentos',detail:'Acompanhar visitantes',id:'atendimentos',icon:'clipboard'},
          ]:[
            {label:'Meu financeiro',detail:'Comissões e recebimentos',id:'financeiro',icon:'wallet'},
            ...(user.role==='corretor'?[{label:'Meus fechamentos',detail:'Recebimentos e repasses por período',id:'fechamentos',icon:'arrows'}]:[]),
            {label:'Minhas despesas',detail:'Registrar gastos',id:'despesas',icon:'receipt'},
            {label:'Empréstimos',detail:'Consultar saldos',id:'emprestimos',icon:'arrows'},
          ]).map(item=><button key={item.id} type="button" className="quick-link" onClick={()=>navigate(item.id)}>
            <span className="quick-icon"><Icon name={item.icon} size={21}/></span>
            <span className="quick-label"><strong>{item.label}</strong><small>{item.detail}</small></span>
            <Icon name="chevron" size={17}/></button>)}
        </div>
      </section>
    </div>
  </>
}
function ModulePage({ page, user }) {
  const item = nav.find(v => v.id===page)
  const admin = user.role === 'admin'
  const perPageTitle = page === 'vendas' && !admin ? 'Minhas vendas' : page === 'financeiro' && !admin ? 'Meu financeiro' : item?.label
  return <div className="module-page">
    <div className="module-heading"><div><span className="eyebrow">SPLASH / {item?.section.toUpperCase()}</span><h1>{perPageTitle}</h1><p>{descriptions[page]}</p></div><div className="module-heading-icon"><Icon name={item?.icon || 'grid'} size={28}/></div></div>
    <div className="module-content">
      {page==='configuracoes' ? <section className="panel checklist-panel">
        <div className="panel-head"><div><h3>Preparação do sistema</h3><p>Primeira etapa de implantação</p></div><span className="hint-badge">Estrutura inicial</span></div>
        {[
          ['Interface React responsiva','Disponível'],
          ['Sessão com CodeIgniter Shield','Integrada'],
          ['Cadastros e regras financeiras','Em desenvolvimento'],
          ['Relatórios PDF e importação','Em desenvolvimento']
        ].map(([title,st],i)=><div className="check-row" key={title}><span className={'check-mark '+(i<2?'done':'pending')}><Icon name={i<2?'check':'clock'} size={17}/></span><strong>{title}</strong><small>{st}</small></div>)}
      </section> : <section className="panel module-table"><div className="panel-head"><div><h3>{perPageTitle}</h3><p>Registros vinculados à sua conta e às suas permissões.</p></div><span className="hint-badge">Módulo em preparação</span></div><NoData icon={item?.icon} title="Tudo pronto para começar" description="Estamos preparando o cadastro e a consulta deste módulo. Não existem dados de demonstração ou lançamentos fictícios nesta tela." /></section>}
    </div>
  </div>
}

function App() {
  const [session, setSession] = useState({ status: 'loading', user: null, csrf: null })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState('dashboard')
  const [arrivalClient, setArrivalClient] = useState(null)
  const [initialSaleVisit, setInitialSaleVisit] = useState(null)
  const [initialSaleOperation, setInitialSaleOperation] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const [theme, setTheme] = useState('light')

  async function refresh() {
    try {
      const data = await getJSON('/api/session')
      setSession({status: data.authenticated ? 'in' : 'out', user: data.user, csrf: data.csrf})
      setError('')
    } catch (e) {
      setError(e.status ? 'O servidor CodeIgniter respondeu com erro HTTP ' + e.status + '. Verifique o terminal do PHP e os logs do backend.' : 'Não foi possível conectar ao CodeIgniter. Verifique se o servidor está ativo na porta 8080.')
      setSession({status:'offline',user:null,csrf:null})
    }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; document.title = 'SPLASH · Gestão de títulos' }, [theme])

  async function login(username, password) {
    setBusy(true);setError('')
    try {
      // O CSRF em sessão gira a cada POST. Não reutilizar o token
      // guardado no React após logout, troca de usuário ou outra operação.
      const token = (await getJSON('/api/session')).csrf
      if (!token?.header || !token?.hash) throw new Error('Não foi possível validar sua sessão. Tente novamente.')
      const data = await getJSON('/api/session/login', {method:'POST',headers:{'Content-Type':'application/json',[token.header]:token.hash},body:JSON.stringify({username,password})})
      setSession({status:'in',user:data.user,csrf:data.csrf})
      setCurrent('dashboard')
    } catch(e) {
      if (e.data?.csrf) setSession(s => ({...s,csrf:e.data.csrf}))
      else if (e.status===403) {
        // Um token expirado antes de chegar ao controller não vem no JSON.
        // Recarrega a sessão para o próximo envio, sem repetir a senha
        // nem criar uma segunda tentativa automática de autenticação.
        try {
          const fresh = await getJSON('/api/session')
          setSession({status:fresh.authenticated?'in':'out',user:fresh.user,csrf:fresh.csrf})
        } catch { /* preserva o erro original */ }
      }
      setError(e.status===403 && !e.data?.message
        ? 'A proteção da sessão foi renovada. Tente entrar novamente.'
        : e.message)
    } finally {setBusy(false)}
  }
  async function logout() {
    setBusy(true);setError('')
    try {
      const token = (await getJSON('/api/session')).csrf
      if (!token?.header || !token?.hash) throw new Error('Token de sessão indisponível.')
      const data = await getJSON('/api/session/logout',{method:'POST',headers:{[token.header]:token.hash}})
      // O backend gera um CSRF novo DEPOIS de encerrar a sessão Shield.
      setSession({status:'out',user:null,csrf:data.csrf})
      setCurrent('dashboard')
    } catch(e) {
      setError('Não foi possível encerrar a sessão. Tente novamente.')
      await refresh()
    } finally {setBusy(false)}
  }
  const go = (id, client = null) => {
    if(id==='atendimentos' && client?.id) setArrivalClient(client)
    if((id==='vendas'||id==='pendencias') && client?.operacao_id) setInitialSaleOperation({id:client.operacao_id})
    else if((id==='vendas'||id==='pendencias') && client?.id) setInitialSaleVisit(client)
    setCurrent(id);setNoticesOpen(false);window.scrollTo({top:0,behavior:'smooth'})
  }
  if (session.status==='loading') return <div className="splash-loading"><Brand/><span className="loading-spinner"/><p>Preparando seu espaço...</p></div>
  if (session.status!=='in') return <Login onLogin={login} error={error} busy={busy} offline={session.status==='offline'} onRetry={refresh}/>
  const user=session.user || {username:'Usuário',role:'restrito'}
  const allowed=nav.filter(x=>x.roles.includes(user.role))
  const active=allowed.some(x=>x.id===current)?current:'dashboard'
  const mobileNav=['dashboard','atendimentos','vendas','financeiro','relatorios'].map(id=>allowed.find(x=>x.id===id)).filter(Boolean).slice(0,5)
  return <div className="app-shell">
    <Sidebar user={user} current={active} navigate={go} open={menuOpen} close={()=>setMenuOpen(false)} logout={logout}/>
    <div className="workspace">
      <header className="topbar">
        <div className="top-left"><button className="icon-btn hamburger" onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Icon name="menu"/></button><div className="top-breadcrumb"><span>SPLASH</span><Icon name="chevron" size={14}/><strong>{active==='dashboard'?'Visão geral':nav.find(x=>x.id===active)?.label}</strong></div></div>
        <div className="top-actions">
          <span className="connection-indicator"><span/> Conectado</span>
          <button className="icon-btn" title="Alternar tema" aria-label="Alternar tema" onClick={()=>setTheme(t=>t==='light'?'dark':'light')}><Icon name={theme==='light'?'moon':'sun'} size={20}/></button>
          <div className="notification-wrap"><button className="icon-btn" title="Notificações" aria-label="Notificações" aria-expanded={noticesOpen} onClick={()=>setNoticesOpen(s=>!s)}><Icon name="bell" size={20}/></button>{noticesOpen&&<div className="notification-pop"><strong>Notificações</strong><p>Os avisos de renovação e retornos aparecerão aqui quando o módulo estiver ativo.</p></div>}</div>
          <span className="top-avatar" title={user.username}>{initials(user.username)}</span>
        </div>
      </header>
      <main className="main-content">
        {user.role==='restrito' ? <section className="panel access-warning"><Icon name="shield" size={30}/><h1>Acesso aguardando liberação</h1><p>Sua conta foi criada. Um administrador precisa atribuir um grupo para liberar os módulos do SPLASH.</p></section> : active==='dashboard'?<Dashboard user={user} navigate={go}/>:active==='planos'?<Planos/>:active==='pessoas'||active==='usuarios'?<PessoasUsuarios tab={active}/>:active==='clientes'?<Clientes navigate={go}/>:active==='atendimentos'?<Atendimentos initialClient={arrivalClient} onClientAccepted={()=>setArrivalClient(null)} navigate={go} admin={user.role==='admin'}/>:active==='origens'?<OrigensMotivos/>:active==='configuracoes'?<RegrasComissoes/>:active==='fechamentos'?<FechamentosPeriodos role={user.role}/>:active==='relatorios'?<Relatorios role={user.role}/>:(active==='financeiro'||active==='despesas'||active==='emprestimos')?<Financeiro key={active} role={user.role} initialTab={active==='despesas'?'despesas':active==='emprestimos'?'emprestimos':'comissoes'}/>: (active==='vendas'||active==='pendencias')&&user.role==='admin'?<Vendas tab={active} role={user.role} initialVisit={initialSaleVisit} onVisitAccepted={()=>setInitialSaleVisit(null)} initialOperation={initialSaleOperation} onOperationAccepted={()=>setInitialSaleOperation(null)}/>:<ModulePage page={active} user={user}/>}
        <footer className="app-footer"><span>© {new Date().getFullYear()} SPLASH · Ahritech</span><span>Feito para simplificar sua gestão</span></footer>
      </main>
    </div>
    <nav className="mobile-bottom" aria-label="Navegação principal">{mobileNav.map(item=><button type="button" key={item.id} className={'mobile-tab '+(active===item.id?'active':'')} onClick={()=>go(item.id)}><Icon name={item.icon} size={22}/><span>{item.id==='dashboard'?'Início':item.id==='atendimentos'?'Visitas':item.id==='financeiro'?'Financeiro':item.id==='relatorios'?'Relatórios':item.label}</span></button>)}<button type="button" className={'mobile-tab '+(menuOpen?'active':'')} onClick={()=>setMenuOpen(true)}><Icon name="menu" size={22}/><span>Menu</span></button></nav>
  </div>
}

export default App
