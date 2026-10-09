export async function comercialGet(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({})) : {}
  if (!response.ok) throw new Error(body.message || 'Erro HTTP ' + response.status)
  return body
}

export async function comercialPost(url, payload) {
  const session = await comercialGet('/api/session')
  if (!session.authenticated || !session.csrf) throw new Error('Sua sessão expirou. Entre novamente.')
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      [session.csrf.header]: session.csrf.hash,
    },
    body: JSON.stringify(payload),
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({})) : {}
  if (!response.ok) throw new Error(body.message || 'Erro HTTP ' + response.status)
  return body
}

export function dateBR(value, time = false) {
  if (!value) return '—'
  const v = String(value).replace(' ', 'T')
  const date = new Date(v.length === 10 ? v + 'T12:00:00' : v)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

export function localDateISO() {
  const d = new Date()
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
}

export function timeSpan(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const n = Math.max(0, Math.round(Number(seconds)))
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = n % 60
  if (h) return h+'h '+String(m).padStart(2, '0')+'min'
  if (m) return m+'min'+(s ? ' '+s+'s' : '')
  return s+'s'
}

export function personOptions(pessoas, roles = []) {
  return (pessoas || [])
    .filter(p => p.ativo && (!roles.length || roles.some(role => p.papeis.includes(role))))
    .map(p => ({ value: String(p.id), label: p.nome }))
}
