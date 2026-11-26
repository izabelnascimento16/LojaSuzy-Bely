export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpfInput(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function isValidCpfClient(cpfRaw: string): boolean {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === Number(cpf[10]);
}

export function formatCepInput(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function formatPhoneInput(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

export type SupportedPhoneCountry = 'BR' | 'PT';

export function detectPhoneCountry(value?: string | null): SupportedPhoneCountry {
  const raw = String(value || '').trim();
  const digits = onlyDigits(raw);
  if (raw.startsWith('+351') || (digits.startsWith('351') && digits.length === 12)) {
    return 'PT';
  }
  return 'BR';
}

export function extractLocalPhoneDigits(value: string, country: SupportedPhoneCountry): string {
  let digits = onlyDigits(value);
  if (country === 'PT') {
    if (digits.startsWith('351') && digits.length > 9) digits = digits.slice(3);
    return digits.slice(0, 9);
  }
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  return digits.slice(0, 11);
}

export function formatInternationalPhoneInput(value: string, country: SupportedPhoneCountry): string {
  const local = extractLocalPhoneDigits(value, country);
  if (country === 'PT') {
    if (local.length <= 3) return local;
    if (local.length <= 6) return `${local.slice(0, 3)} ${local.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`;
  }
  return formatPhoneInput(local);
}

export function isValidInternationalPhoneClient(value: string, country: SupportedPhoneCountry): boolean {
  const local = extractLocalPhoneDigits(value, country);
  return country === 'PT' ? local.length === 9 : local.length === 10 || local.length === 11;
}

export function effectivePriceCents(priceCents: number, promoPriceCents: number | null): number {
  if (promoPriceCents !== null && promoPriceCents > 0 && promoPriceCents < priceCents) {
    return promoPriceCents;
  }
  return priceCents;
}

export function discountPercent(priceCents: number, promoPriceCents: number | null): number {
  if (promoPriceCents === null || promoPriceCents <= 0 || promoPriceCents >= priceCents) return 0;
  return Math.round(((priceCents - promoPriceCents) / priceCents) * 100);
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando Pagamento',
  pago: 'Pagamento Aprovado',
  em_separacao: 'Em Separação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  boleto: 'Boleto Bancário',
};

export function normalizeWhatsAppDigits(rawPhone?: string | null): string {
  const digits = onlyDigits(String(rawPhone || ''));
  if (digits.length < 10) return '';
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildWhatsAppUrl(rawPhone?: string | null, customMessage?: string | null): string {
  const fullDigits = normalizeWhatsAppDigits(rawPhone);
  if (!fullDigits) return '';
  const base = `https://wa.me/${fullDigits}`;
  const text = (customMessage || '').trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function formatWhatsAppDisplay(rawPhone?: string | null): string {
  const digits = onlyDigits(String(rawPhone || ''));
  if (digits.length < 10) return '';
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6, 10)}`;
  }
  return `+${digits}`;
}

