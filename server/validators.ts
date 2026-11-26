export const BRAZILIAN_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function isValidCpf(cpfRaw: string): boolean {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === Number(cpf[10]);
}

export function isValidCep(cepRaw: string): boolean {
  return onlyDigits(cepRaw).length === 8;
}

export function formatCep(cepRaw: string): string {
  const d = onlyDigits(cepRaw).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export interface NormalizedPhone {
  valid: boolean;
  country: 'BR' | 'PT';
  dialCode: '55' | '351';
  localDigits: string;
  e164: string;
  display: string;
}

export function normalizeInternationalPhone(
  phoneRaw: string,
  preferredCountry?: 'BR' | 'PT' | '+55' | '+351'
): NormalizedPhone {
  const digits = onlyDigits(phoneRaw);
  const preferPT = preferredCountry === 'PT' || preferredCountry === '+351';

  // Explicit +351 Portugal or PT selected with 9 digits
  if (digits.startsWith('351') && digits.length === 12) {
    const local = digits.slice(3);
    const valid = /^[239]\d{8}$/.test(local);
    return {
      valid,
      country: 'PT',
      dialCode: '351',
      localDigits: local,
      e164: `+351${local}`,
      display: `+351 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`,
    };
  }

  if (preferPT) {
    const local = digits.startsWith('351') ? digits.slice(3) : digits;
    const valid = /^[239]\d{8}$/.test(local);
    return {
      valid,
      country: 'PT',
      dialCode: '351',
      localDigits: local,
      e164: `+351${local}`,
      display: local.length === 9 ? `+351 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}` : phoneRaw,
    };
  }

  // Explicit +55 Brazil or local BR (10 or 11 digits)
  const brLocal = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  const brValid = brLocal.length === 10 || brLocal.length === 11;
  return {
    valid: brValid,
    country: 'BR',
    dialCode: '55',
    localDigits: brLocal,
    e164: `+55${brLocal}`,
    display:
      brLocal.length === 11
        ? `+55 (${brLocal.slice(0, 2)}) ${brLocal.slice(2, 7)}-${brLocal.slice(7, 11)}`
        : brLocal.length === 10
          ? `+55 (${brLocal.slice(0, 2)}) ${brLocal.slice(2, 6)}-${brLocal.slice(6, 10)}`
          : phoneRaw,
  };
}

export function isValidPhone(phoneRaw: string, preferredCountry?: 'BR' | 'PT' | '+55' | '+351'): boolean {
  return normalizeInternationalPhone(phoneRaw, preferredCountry).valid;
}

export interface FreightConfig {
  freeShippingThresholdCents?: number;
  shippingMode?: 'regional' | 'fixed';
  fixedPacCents?: number;
  fixedSedexCents?: number;
  shippingExtraDays?: number;
}

export function calculateFreightByCep(
  cepDigits: string,
  subtotalCents: number,
  config?: FreightConfig
): {
  pacCents: number;
  pacDays: number;
  sedexCents: number;
  sedexDays: number;
  freeEligible: boolean;
  regionLabel: string;
} {
  const firstDigit = Number(cepDigits[0] || '0');
  const threshold = config?.freeShippingThresholdCents ?? 0;
  const freeEligible = threshold > 0 && subtotalCents >= threshold;
  const extraDays = Math.max(0, config?.shippingExtraDays ?? 0);

  let pacCents = 1890;
  let pacDays = 6;
  let sedexCents = 3290;
  let sedexDays = 2;
  let regionLabel = 'Sudeste';

  if (firstDigit >= 0 && firstDigit <= 3) {
    regionLabel = 'Sudeste';
    pacCents = 1490;
    pacDays = 4;
    sedexCents = 2590;
    sedexDays = 2;
  } else if (firstDigit >= 8 && firstDigit <= 9) {
    regionLabel = 'Sul';
    pacCents = 1890;
    pacDays = 5;
    sedexCents = 3390;
    sedexDays = 3;
  } else if (firstDigit === 7) {
    regionLabel = 'Centro-Oeste';
    pacCents = 1990;
    pacDays = 6;
    sedexCents = 3590;
    sedexDays = 3;
  } else if (firstDigit >= 4 && firstDigit <= 5) {
    regionLabel = 'Nordeste';
    pacCents = 2490;
    pacDays = 8;
    sedexCents = 4490;
    sedexDays = 4;
  } else {
    regionLabel = 'Norte';
    pacCents = 2890;
    pacDays = 10;
    sedexCents = 5290;
    sedexDays = 5;
  }

  if (config?.shippingMode === 'fixed') {
    pacCents = Math.max(0, config.fixedPacCents ?? pacCents);
    sedexCents = Math.max(0, config.fixedSedexCents ?? sedexCents);
  }

  return {
    pacCents: freeEligible ? 0 : pacCents,
    pacDays: pacDays + extraDays,
    sedexCents,
    sedexDays: sedexDays + extraDays,
    freeEligible,
    regionLabel,
  };
}
