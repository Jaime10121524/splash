export type MobileUser = {
  id: number;
  username: string;
  role: string;
  groups: string[];
};

export type Visit = {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  status: string;
  chegada_em: string;
  inicio_em: string | null;
  fim_em: string | null;
  retorno_previsto: string | null;
  observacoes: string | null;
  atendente_nome: string | null;
  corretor_nome: string | null;
};

export type VisitData = {
  visitas: Visit[];
  indicadores: {
    total: number;
    aguardando: number;
    atendendo: number;
    pendencia: number;
    venda: number;
    retorno: number;
    sem_venda: number;
    canceladas: number;
  };
  limite_lista: number;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiRequest<T>(path: string, options: {
  method?: 'GET' | 'POST'; token?: string | null; body?: unknown;
} = {}): Promise<T> {
  const origin = process.env.EXPO_PUBLIC_SPLASH_API_URL?.replace(/\/+$/, '');
  if (!origin || (!/^https:\/\/[^/]+/i.test(origin) && !(__DEV__ && /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/i.test(origin)))) {
    throw new ApiError('Configure EXPO_PUBLIC_SPLASH_API_URL com a URL HTTPS da API.', 0);
  }
  if (!/^mobile\/[a-z0-9/?=&-]+$/i.test(path)) {
    throw new ApiError('Rota nativa inválida.', 0);
  }

  let response: Response;
  try {
    response = await fetch(origin + '/api/' + path, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError('Sem conexão com o Splash. Verifique sua internet e tente novamente.', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.message ?? 'Não foi possível concluir a operação.', response.status);
  }
  return data as T;
}

export function displayTime(value: string | null | undefined): string {
  if (!value) return '—';
  const match = value.match(/(?:\s|T)(\d{2}:\d{2})/);
  return match?.[1] ?? '—';
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[3] + '/' + match[2] + '/' + match[1] : '—';
}

export function roleName(role: string): string {
  const roles: Record<string, string> = {
    admin: 'Administrador', corretor: 'Corretor', gerente: 'Gerente',
    vendedor: 'Vendedor', operador: 'Operador', restrito: 'Usuário',
  };
  return roles[role] ?? 'Usuário';
}
