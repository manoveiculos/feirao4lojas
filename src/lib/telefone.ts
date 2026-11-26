/** Máscara e validação de celular brasileiro: (XX) 9XXXX-XXXX */

export function mascararTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2); // colou com DDI
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Celular válido: DDD (11–99) + 9 + 8 dígitos, sem sequências repetidas. */
export function telefoneValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  if (d[2] !== '9') return false;
  if (/^(\d)\1+$/.test(d.slice(2))) return false;
  return true;
}

export function nomeValido(valor: string): boolean {
  return valor.trim().length >= 2;
}
