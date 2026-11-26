import {db} from './db.ts';

export interface SmsSummary {
  configured: boolean;
  provider: 'twilio' | 'webhook' | 'none';
}

export interface SmsLogEntry {
  id: number;
  recipient_phone: string;
  provider: string;
  status: 'sent' | 'skipped_no_provider' | 'failed';
  error_message: string;
  created_at: string;
}

function isSafeWebhookUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getSmsProvider(): 'twilio' | 'webhook' | 'none' {
  if (
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_FROM_NUMBER?.trim()
  ) {
    return 'twilio';
  }
  if (process.env.SMS_WEBHOOK_URL?.trim() && isSafeWebhookUrl(process.env.SMS_WEBHOOK_URL)) {
    return 'webhook';
  }
  return 'none';
}

export function isSmsConfigured(): boolean {
  return getSmsProvider() !== 'none';
}

export function getSmsSummary(): SmsSummary {
  const provider = getSmsProvider();
  return {
    configured: provider !== 'none',
    provider,
  };
}

export function getRecentSmsLogs(limit = 10): SmsLogEntry[] {
  return db
    .prepare(
      'SELECT id, recipient_phone, provider, status, error_message, created_at FROM sms_logs ORDER BY id DESC LIMIT ?'
    )
    .all(Math.max(1, Math.min(50, limit))) as SmsLogEntry[];
}

function recordSmsLog(
  recipientPhone: string,
  provider: string,
  status: 'sent' | 'skipped_no_provider' | 'failed',
  errorMessage = ''
): void {
  try {
    db.prepare(
      'INSERT INTO sms_logs (recipient_phone, provider, status, error_message) VALUES (?, ?, ?, ?)'
    ).run(recipientPhone.slice(0, 30), provider.slice(0, 30), status, errorMessage.slice(0, 300));
  } catch {
    // Non-blocking audit log
  }
}

export async function sendVerificationSms(params: {
  toE164: string;
  fullName: string;
  code: string;
}): Promise<{dispatched: boolean; status: 'sent' | 'skipped_no_provider' | 'failed'; errorMessage?: string}> {
  const provider = getSmsProvider();
  const recipient = params.toE164.trim();

  if (!/^\+(55\d{10,11}|351\d{9})$/.test(recipient)) {
    recordSmsLog(recipient || 'invalido', provider, 'failed', 'Número inválido para envio (+55 ou +351).');
    return {dispatched: false, status: 'failed', errorMessage: 'Número de telefone inválido para SMS (+55 ou +351).'};
  }

  const firstName = params.fullName.trim().split(/\s+/)[0] || 'Cliente';
  const bodyText = `Suzy Bely: Olá ${firstName}, seu código de confirmação é ${params.code}. Válido por 5 minutos.`;

  if (provider === 'none') {
    recordSmsLog(recipient, 'none', 'skipped_no_provider', 'Provedor externo de SMS não configurado no servidor.');
    return {
      dispatched: false,
      status: 'skipped_no_provider',
      errorMessage: 'Serviço externo de SMS ainda não configurado no servidor.',
    };
  }

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
    const token = process.env.TWILIO_AUTH_TOKEN!.trim();
    const from = process.env.TWILIO_FROM_NUMBER!.trim();
    const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');

    try {
      const form = new URLSearchParams({
        To: recipient,
        From: from,
        Body: bodyText,
      });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        const msg = `Twilio respondeu HTTP ${res.status}: ${errText.slice(0, 160)}`;
        recordSmsLog(recipient, 'twilio', 'failed', msg);
        return {dispatched: false, status: 'failed', errorMessage: msg};
      }

      recordSmsLog(recipient, 'twilio', 'sent');
      return {dispatched: true, status: 'sent'};
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro de conexão com serviço Twilio.';
      recordSmsLog(recipient, 'twilio', 'failed', msg);
      return {dispatched: false, status: 'failed', errorMessage: msg};
    }
  }

  // Generic HTTPS SMS Webhook provider
  const webhookUrl = isSafeWebhookUrl(process.env.SMS_WEBHOOK_URL || '');
  if (!webhookUrl) {
    recordSmsLog(recipient, 'webhook', 'failed', 'URL do provedor SMS inválida ou não segura.');
    return {dispatched: false, status: 'failed', errorMessage: 'URL do serviço de SMS inválida.'};
  }

  try {
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (process.env.SMS_API_KEY?.trim()) {
      headers.Authorization = `Bearer ${process.env.SMS_API_KEY.trim()}`;
    }
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: recipient,
        message: bodyText,
        code: params.code,
        brand: 'Suzy Bely',
      }),
    });

    if (!res.ok) {
      const msg = `Provedor SMS respondeu HTTP ${res.status}`;
      recordSmsLog(recipient, 'webhook', 'failed', msg);
      return {dispatched: false, status: 'failed', errorMessage: msg};
    }

    recordSmsLog(recipient, 'webhook', 'sent');
    return {dispatched: true, status: 'sent'};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro de conexão com provedor de SMS.';
    recordSmsLog(recipient, 'webhook', 'failed', msg);
    return {dispatched: false, status: 'failed', errorMessage: msg};
  }
}
