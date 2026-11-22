/**
 * Máscara brasileira (DDD) com 10 ou 11 dígitos.
 * A API deve receber somente os números, removendo a máscara.
 */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  // Aceitar também números colados com prefixo internacional +55.
  const brazilian = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2) : digits;
  return brazilian.slice(0, 11);
}

export function maskPhoneBR(value: string): string {
  const d = phoneDigits(value);
  if (!d) return '';
  if (d.length <= 2) return '(' + d;
  const ddd = '(' + d.slice(0, 2) + ') ';
  const rest = d.slice(2);
  const split = d.length === 11 ? 5 : 4;
  if (rest.length <= split) return ddd + rest;
  return ddd + rest.slice(0, split) + '-' + rest.slice(split);
}

/**
 * Evita que apagar um separador reponha a máscara sem permitir a exclusão.
 * Trata colagens, digitação e backspace (incluindo apagar apenas ' ' ou '-').
 */
export function editMaskedPhoneBR(previous: string, next: string): string {
  const oldDigits = phoneDigits(previous);
  const nextDigits = phoneDigits(next);
  if (next.length < previous.length && nextDigits === oldDigits && nextDigits.length) {
    return maskPhoneBR(nextDigits.slice(0, -1));
  }
  return maskPhoneBR(nextDigits);
}
