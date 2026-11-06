import {File,Paths,UploadType} from 'expo-file-system';
import {fetch as expoFetch} from 'expo/fetch';
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

export type VisitDetail = Visit & {
  corretor_pessoa_id: number | null;
  segundo_corretor_pessoa_id: number | null;
  atendente_pessoa_id: number | null;
  atendente_adicional_pessoa_id: number | null;
  adicional_nome: string | null;
  segundo_corretor_nome: string | null;
  motivo_nao_venda_id: number | null;
  motivo_nome: string | null;
  operacao_situacao: string | null;
  operacao_id?: number | null;
  cliente_cpf: string | null;
  cliente_email: string | null;
  cliente_nascimento: string | null;
};

export type VisitHistoryEvent = {
  status_anterior: string | null;
  status_novo: string;
  criado_em: string;
};

export type AttendantChangeEvent = {
  criado_em: string;
  atendente_anterior_pessoa_id: number | null;
  atendente_novo_pessoa_id: number;
  anterior_nome: string | null;
  novo_nome: string;
};

export type VisitDetailsResponse = {
  visita: VisitDetail;
  historico: VisitHistoryEvent[];
  trocas_atendente?: AttendantChangeEvent[];
};

export type MobilePersonOption = { id: number; nome: string };
export type MobileVisitOptions = {
  corretores: MobilePersonOption[];
  atendentes: MobilePersonOption[];
  motivos: { id: number; descricao: string }[];
  origens: { id: number; nome: string; permite_indicador: boolean }[];
  minha_pessoa_id: number | null;
};
export type MobileClient = { id: number; nome: string; telefone: string | null };

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
  method?: 'GET' | 'POST'; token?: string | null; body?: unknown; timeoutMs?: number;
} = {}): Promise<T> {
  const origin = process.env.EXPO_PUBLIC_SPLASH_API_URL?.replace(/\/+$/, '');
  // HTTPS obrigatório na distribuição. Exceção explícita APENAS para
  // APK de homologação Expo "preview" em Wi-Fi privado; não usar dados reais.
  const localDevUrl = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d{1,5})?$/i;
  const privateLanUrl = /^http:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d{1,5})?$/i;
  const allowPreviewLan = process.env.EXPO_PUBLIC_SPLASH_ALLOW_LAN_HTTP === 'true';
  const httpsUrl = /^https:\/\/[^/\s]+$/i;
  if (!origin || (!httpsUrl.test(origin) && !(
    (__DEV__ && localDevUrl.test(origin)) ||
    (allowPreviewLan && privateLanUrl.test(origin))
  ))) {
    throw new ApiError('API inválida: use HTTPS ou IP privado HTTP autorizado no APK de testes.', 0);
  }
  if (!/^mobile\/[a-z0-9/?=&%._-]+$/i.test(path)) {
    throw new ApiError('Rota nativa inválida.', 0);
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 12000, 2000), 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(origin + '/api/' + path, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    const raw = await response.text();
    let data: { message?: string; [key: string]: unknown } = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {
      if (!response.ok) throw new ApiError('O servidor retornou HTTP ' + response.status + ' sem JSON. Confira o log do backend.', response.status);
      throw new ApiError('Resposta inesperada da API. Verifique o backend.', response.status);
    }

    if (!response.ok) {
      const detail = typeof data.message === 'string' ? data.message : 'Erro HTTP ' + response.status + ' no backend.';
      if (response.status >= 500) {
        // Mensagem de implantação conhecida e controlada pelo próprio backend:
        // pode ser exibida sem revelar detalhes internos nem stack trace.
        if (response.status === 503 && detail.startsWith('Agendamentos ainda não está instalado')) {
          throw new ApiError(detail, response.status);
        }
        throw new ApiError('O servidor Splash falhou (HTTP ' + response.status + '). Confira o terminal do PHP.', response.status);
      }
      throw new ApiError(detail, response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError('O servidor não respondeu em ' + Math.round(timeoutMs / 1000) + ' segundos. Verifique o IP, a porta 8080 e o terminal do backend.', 0);
    }
    throw new ApiError('Não foi possível conectar à API. Verifique o endereço, Wi-Fi e firewall do computador.', 0);
  } finally {
    clearTimeout(timeout);
  }
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

/** URLs da API privada: a foto não é pública e requer Authorization no Image. */
export function mobileMediaUrl(path:string):string {
  const origin=process.env.EXPO_PUBLIC_SPLASH_API_URL?.replace(/\/+$/,'');
  if(!origin || !/^mobile\/(?:me\/foto|vendas\/[1-9]\d*\/foto)$/.test(path))
    throw new Error('Endereço da foto inválido.');
  return origin+'/api/'+path;
}

/**
 * Busca uma foto privada com o token e armazena SOMENTE na área temporária
 * privada do aplicativo. <Image> recebe o arquivo local, não a URL autenticada.
 * Null significa foto inexistente (404); outros erros devem ser mostrados.
 */
export async function fetchMobilePhoto(path:string,token:string):Promise<string|null>{
  const url=mobileMediaUrl(path);
  const response=await expoFetch(url,{headers:{
    Authorization:'Bearer '+token,Accept:'image/jpeg, image/png, image/webp',
    'Cache-Control':'no-cache',
  }});
  if(response.status===404)return null;
  if(!response.ok){
    let detail='Falha ao abrir foto no servidor (HTTP '+response.status+').';
    try{const err=await response.json();if(typeof err?.message==='string')detail=err.message;}catch{}
    throw new ApiError(detail,response.status);
  }
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const ext=type==='image/jpeg'?'jpg':type==='image/png'?'png':type==='image/webp'?'webp':null;
  if(!ext)throw new Error('O servidor não retornou uma imagem válida.');
  const bytes=await response.bytes();
  if(bytes.length<20||bytes.length>6*1024*1024)throw new Error('Tamanho da imagem recebida é inválido.');
  const file=new File(Paths.cache,'splash-private-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext);
  await file.write(bytes);
  if(!file.exists||file.size===0)throw new Error('O telefone não conseguiu preparar a foto para exibição.');
  return file.uri;
}

export async function uploadMobilePhoto(path:string,asset:{
  uri:string;mimeType?:string|null;fileName?:string|null;fileSize?:number|null
},token:string):Promise<{message:string;uri:string}> {
  const url=mobileMediaUrl(path);
  const type=asset.mimeType||'image/jpeg';
  if(!['image/jpeg','image/png','image/webp'].includes(type))
    throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  const limit=path==='mobile/me/foto'?2*1024*1024:5*1024*1024;
  if(asset.fileSize && asset.fileSize>limit)
    throw new Error('Foto muito grande. Limite: '+(limit/1048576)+' MB.');
  // SDK 58 / React Native 0.88: objetos {uri,name,type} não são mais
  // FormDataParts válidos para o fetch padrão do RN. O Expo envia multipart
  // diretamente por sua API nativa de arquivos, preservando nome "foto".
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const file=new File(asset.uri);
    if(!file.exists)throw new Error('A foto selecionada não está mais disponível. Selecione novamente.');
    const result=await file.upload(url,{
      uploadType:UploadType.MULTIPART,fieldName:'foto',
      httpMethod:'POST',mimeType:type,
      headers:{Accept:'application/json',Authorization:'Bearer '+token},
      signal:controller.signal,
    });
    let output:{message?:string}={};
    try{output=JSON.parse(result.body||'{}');}catch{}
    if(result.status<200||result.status>=300)
      throw new Error(output.message||'Falha ao enviar foto (HTTP '+result.status+').');
    const uri=await fetchMobilePhoto(path,token);
    if(!uri)throw new Error('O servidor confirmou o upload, mas a foto não está disponível para consulta.');
    return {message:output.message||'Foto enviada.',uri};
  }catch(e){
    if(controller.signal.aborted)throw new Error('O upload demorou demais. Confira a conexão.');
    throw e;
  }finally{clearTimeout(timeout);}
}
