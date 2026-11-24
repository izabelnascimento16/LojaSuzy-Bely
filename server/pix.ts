// Brazilian Central Bank (BCB) EMV QR Code / PIX Copia e Cola generator

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

function normalizeAscii(value: string, maxLen: number): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-_]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

export function normalizePixKey(key: string, keyType: PixKeyType): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (keyType === 'cpf' || keyType === 'cnpj') {
    return trimmed.replace(/\D/g, '');
  }
  if (keyType === 'phone') {
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`;
  }
  if (keyType === 'email') {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

function tlv(id: string, value: string): string {
  const len = String(Buffer.byteLength(value, 'utf8')).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  const bytes = Buffer.from(payload, 'utf8');
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePixPayload(params: {
  pixKey: string;
  pixKeyType: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txId: string;
}): string {
  const normalizedKey = normalizePixKey(params.pixKey, params.pixKeyType);
  if (!normalizedKey) return '';

  const name = normalizeAscii(params.merchantName || 'SUZY BELY', 25) || 'SUZY BELY';
  const city = normalizeAscii(params.merchantCity || 'JI-PARANA', 15) || 'JI-PARANA';
  const txId = params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'SUZYBELY';
  const amount = (Math.max(1, params.amountCents) / 100).toFixed(2);

  const merchantAccountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizedKey);
  const additionalData = tlv('05', txId);

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amount) +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', additionalData) +
    '6304';

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}
