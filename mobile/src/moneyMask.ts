/** Máscara monetária para edição em centavos, independente do teclado/locale.
 * Digitar 1234 => R$ 12,34. O envio à API continua em decimal "12.34".
 */
const formatter=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

/** Formata o que veio do teclado; preserva vazio para permitir apagar o campo. */
export function maskBRL(input:string):string {
  const digits=input.replace(/\D/g,'').slice(0,14);
  if(!digits)return '';
  return formatter.format(Number(digits)/100);
}

/** Valores persistidos pela API são decimais com ponto, não centavos digitados. */
export function decimalToBRL(input:string|null|undefined):string {
  const raw=(input??'').trim();
  if(!raw)return '';
  const match=raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if(!match)return maskBRL(raw);
  return maskBRL(match[1]+(match[2]||'').padEnd(2,'0'));
}

/** Aceita os valores mascarados antes de serializar para a API. */
export function brlToCents(value:string):number|null {
  const raw=value.trim().replace(/\s|R\$/g,'');
  const n=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  if(!/^\d+(?:\.\d{1,2})?$/.test(n))return null;
  const parsed=Math.round(Number(n)*100);
  return Number.isSafeInteger(parsed)?parsed:null;
}
