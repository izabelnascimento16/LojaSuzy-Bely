import nodemailer from 'nodemailer';
import {db, getStoreSettings} from './db.ts';
import {isValidEmail} from './validators.ts';

export type EmailEventType =
  | 'welcome'
  | 'order_confirmation'
  | 'owner_new_order'
  | 'order_status'
  | 'password_reset'
  | 'admin_test';

export interface EmailLogEntry {
  id: number;
  recipient_email: string;
  subject: string;
  event_type: string;
  status: 'sent' | 'skipped_no_smtp' | 'failed';
  error_message: string;
  created_at: string;
}

export interface SmtpSummary {
  configured: boolean;
  hostConfigured: boolean;
  userConfigured: boolean;
  fromAddress: string;
  port: number;
}

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando Pagamento',
  pago: 'Pagamento Confirmado',
  em_separacao: 'Em Separação',
  enviado: 'Enviado para Entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  boleto: 'Boleto Bancário',
};

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHeaderLineBreaks(value: string): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export function getSmtpSummary(): SmtpSummary {
  const settings = getStoreSettings();
  const port = Number(process.env.SMTP_PORT) || 587;
  const fromEnv = stripHeaderLineBreaks(process.env.SMTP_FROM || '');
  const fallbackFrom = stripHeaderLineBreaks(settings.contact_email || 'atendimento@suzybely.com.br');
  return {
    configured: isSmtpConfigured(),
    hostConfigured: Boolean(process.env.SMTP_HOST?.trim()),
    userConfigured: Boolean(process.env.SMTP_USER?.trim()),
    fromAddress: fromEnv || fallbackFrom,
    port,
  };
}

export function getRecentEmailLogs(limit = 12): EmailLogEntry[] {
  return db
    .prepare(
      'SELECT id, recipient_email, subject, event_type, status, error_message, created_at FROM email_logs ORDER BY id DESC LIMIT ?'
    )
    .all(Math.max(1, Math.min(50, limit))) as EmailLogEntry[];
}

function recordEmailLog(
  recipientEmail: string,
  subject: string,
  eventType: EmailEventType,
  status: 'sent' | 'skipped_no_smtp' | 'failed',
  errorMessage = ''
): void {
  try {
    db.prepare(
      'INSERT INTO email_logs (recipient_email, subject, event_type, status, error_message) VALUES (?, ?, ?, ?, ?)'
    ).run(
      recipientEmail.slice(0, 140),
      subject.slice(0, 200),
      eventType,
      status,
      errorMessage.slice(0, 300)
    );
  } catch {
    // Do not interrupt user request if logging fails
  }
}

function wrapEmailLayout(title: string, bodyHtml: string, footerNote: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FFF9F4;font-family:Arial,Helvetica,sans-serif;color:#3D2113;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FFF9F4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border:1px solid #F2D2B6;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#EA580C;padding:20px 28px;color:#FFFFFF;">
              <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">Suzy Bely</div>
              <div style="font-size:12px;opacity:0.92;margin-top:2px;">Bijuterias &amp; Acessórios · Ji-Paraná, RO</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF2E6;padding:16px 28px;border-top:1px solid #F2D2B6;font-size:12px;color:#7A4D35;line-height:1.5;">
              ${footerNote}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function dispatchEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  eventType: EmailEventType;
}): Promise<{dispatched: boolean; status: 'sent' | 'skipped_no_smtp' | 'failed'; errorMessage?: string}> {
  const recipient = stripHeaderLineBreaks(params.to).toLowerCase();
  const subject = stripHeaderLineBreaks(params.subject);

  if (!isValidEmail(recipient)) {
    recordEmailLog(recipient || 'invalido', subject, params.eventType, 'failed', 'Endereço de e-mail inválido.');
    return {dispatched: false, status: 'failed', errorMessage: 'Endereço de e-mail inválido.'};
  }

  if (!isSmtpConfigured()) {
    recordEmailLog(recipient, subject, params.eventType, 'skipped_no_smtp', 'Credenciais SMTP não configuradas no servidor.');
    return {
      dispatched: false,
      status: 'skipped_no_smtp',
      errorMessage: 'Servidor SMTP não configurado nas variáveis de ambiente.',
    };
  }

  const settings = getStoreSettings();
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const senderName = stripHeaderLineBreaks(settings.email_sender_name || 'Suzy Bely Bijuterias') || 'Suzy Bely Bijuterias';
  const fromEmail = stripHeaderLineBreaks(process.env.SMTP_FROM || '') || user;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {user, pass},
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });

    await transporter.sendMail({
      from: `"${senderName.replace(/"/g, '')}" <${fromEmail}>`,
      to: recipient,
      replyTo: isValidEmail(settings.contact_email) ? settings.contact_email : fromEmail,
      subject,
      text: params.text,
      html: params.html,
    });

    recordEmailLog(recipient, subject, params.eventType, 'sent');
    return {dispatched: true, status: 'sent'};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao enviar e-mail SMTP.';
    recordEmailLog(recipient, subject, params.eventType, 'failed', message);
    return {dispatched: false, status: 'failed', errorMessage: message};
  }
}

export async function sendWelcomeEmail(params: {to: string; fullName: string}) {
  const settings = getStoreSettings();
  if (!settings.email_on_register) {
    return {dispatched: false, status: 'skipped_no_smtp' as const};
  }

  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName;
  const subject = 'Bem-vinda à Suzy Bely! Seu cadastro foi realizado';
  const storeCity = settings.store_city || 'Ji-Paraná, RO';
  const contactEmail = settings.contact_email || 'atendimento@suzybely.com.br';

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#3D2113;">Olá, ${escapeHtml(firstName)}!</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#5E3824;">
      Sua conta na <strong>Suzy Bely Bijuterias &amp; Acessórios</strong> foi criada com sucesso. Agora você pode finalizar suas compras com agilidade, salvar seus endereços de entrega e acompanhar todos os pedidos pela Área do Cliente.
    </p>
    <div style="background-color:#FFF9F4;border:1px solid #F2D2B6;border-radius:10px;padding:14px 16px;margin:18px 0;font-size:13px;color:#5E3824;">
      <strong>E-mail cadastrado:</strong> ${escapeHtml(params.to)}<br />
      <strong>Atendimento:</strong> ${escapeHtml(storeCity)}
    </div>
    <p style="margin:0;font-size:13px;color:#7A4D35;line-height:1.5;">
      Se você não reconhece este cadastro, responda para ${escapeHtml(contactEmail)}.
    </p>
  `;

  const text = `Olá, ${firstName}!\n\nSua conta na Suzy Bely Bijuterias & Acessórios foi criada com sucesso.\nE-mail cadastrado: ${params.to}\nAtendimento: ${storeCity}\n\nQualquer dúvida, fale conosco em ${contactEmail}.`;

  return dispatchEmail({
    to: params.to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, `Suzy Bely Bijuterias · ${escapeHtml(storeCity)} · ${escapeHtml(contactEmail)}`),
    eventType: 'welcome',
  });
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  customerName: string;
  order: {
    orderNumber: string;
    totalCents: number;
    subtotalCents: number;
    shippingCents: number;
    discountCents: number;
    shippingLabel: string;
    estimatedDays: number;
    paymentMethod: 'pix' | 'credit_card' | 'boleto';
    pixCopyPaste?: string;
    checkoutUrl?: string;
    items: {name: string; quantity: number; lineTotalCents: number}[];
  };
}) {
  const settings = getStoreSettings();
  if (!settings.email_on_order) {
    return {dispatched: false, status: 'skipped_no_smtp' as const};
  }

  const {order} = params;
  const subject = `Pedido ${order.orderNumber} confirmado — Suzy Bely`;
  const paymentLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod;
  const storeCity = settings.store_city || 'Ji-Paraná, RO';
  const contactEmail = settings.contact_email || 'atendimento@suzybely.com.br';

  const itemsRowsHtml = order.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #FFE8D4;font-size:13px;color:#3D2113;">${item.quantity}x ${escapeHtml(item.name)}</td>
          <td align="right" style="padding:8px 0;border-bottom:1px solid #FFE8D4;font-size:13px;font-weight:600;color:#3D2113;">${escapeHtml(formatBrl(item.lineTotalCents))}</td>
        </tr>`
    )
    .join('');

  const extraPaymentHtml =
    order.checkoutUrl
      ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(order.checkoutUrl)}" style="display:inline-block;background-color:#EA580C;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:8px;">Abrir Página Segura de Pagamento</a></p>`
      : order.paymentMethod === 'pix' && order.pixCopyPaste
        ? `<div style="margin-top:12px;padding:10px;background-color:#FFFFFF;border:1px dashed #EA580C;border-radius:8px;font-family:monospace;font-size:11px;word-break:break-all;color:#5E3824;"><strong>PIX Copia e Cola:</strong><br />${escapeHtml(order.pixCopyPaste)}</div>`
        : '';

  const bodyHtml = `
    <h1 style="margin:0 0 10px;font-size:20px;color:#3D2113;">Pedido ${escapeHtml(order.orderNumber)} recebido!</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5E3824;">
      Olá, <strong>${escapeHtml(params.customerName)}</strong>. Recebemos o seu pedido na Suzy Bely e reservamos suas peças no estoque.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
      ${itemsRowsHtml}
      <tr>
        <td style="padding:8px 0 4px;font-size:13px;color:#7A4D35;">Subtotal</td>
        <td align="right" style="padding:8px 0 4px;font-size:13px;color:#7A4D35;">${escapeHtml(formatBrl(order.subtotalCents))}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:13px;color:#7A4D35;">Envio (${escapeHtml(order.shippingLabel)} · até ${order.estimatedDays} dia(s) úteis)</td>
        <td align="right" style="padding:4px 0;font-size:13px;color:#7A4D35;">${order.shippingCents === 0 ? 'Grátis' : escapeHtml(formatBrl(order.shippingCents))}</td>
      </tr>
      ${
        order.discountCents > 0
          ? `<tr>
              <td style="padding:4px 0;font-size:13px;color:#047857;">Desconto PIX</td>
              <td align="right" style="padding:4px 0;font-size:13px;color:#047857;">-${escapeHtml(formatBrl(order.discountCents))}</td>
            </tr>`
          : ''
      }
      <tr>
        <td style="padding:10px 0 0;font-size:16px;font-weight:700;color:#3D2113;border-top:2px solid #F2D2B6;">Total</td>
        <td align="right" style="padding:10px 0 0;font-size:16px;font-weight:700;color:#EA580C;border-top:2px solid #F2D2B6;">${escapeHtml(formatBrl(order.totalCents))}</td>
      </tr>
    </table>
    <div style="background-color:#FFF9F4;border:1px solid #F2D2B6;border-radius:10px;padding:14px 16px;font-size:13px;color:#5E3824;">
      <strong>Forma de pagamento:</strong> ${escapeHtml(paymentLabel)}<br />
      <strong>Status atual:</strong> Aguardando confirmação do pagamento
      ${extraPaymentHtml}
    </div>
  `;

  const itemsText = order.items
    .map((item) => `- ${item.quantity}x ${item.name}: ${formatBrl(item.lineTotalCents)}`)
    .join('\n');
  const text = `Pedido ${order.orderNumber} recebido!\n\nOlá, ${params.customerName}.\n\nItens:\n${itemsText}\n\nEnvio (${order.shippingLabel}): ${order.shippingCents === 0 ? 'Grátis' : formatBrl(order.shippingCents)}\nTotal: ${formatBrl(order.totalCents)}\nPagamento: ${paymentLabel}${order.pixCopyPaste ? `\n\nPIX Copia e Cola:\n${order.pixCopyPaste}` : ''}${order.checkoutUrl ? `\n\nLink de pagamento: ${order.checkoutUrl}` : ''}`;

  return dispatchEmail({
    to: params.to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, `Suzy Bely Bijuterias · ${escapeHtml(storeCity)} · ${escapeHtml(contactEmail)}`),
    eventType: 'order_confirmation',
  });
}

export async function sendOwnerNewOrderAlertEmail(params: {
  customerName: string;
  customerEmail: string;
  order: {
    orderNumber: string;
    totalCents: number;
    paymentMethod: 'pix' | 'credit_card' | 'boleto';
    shippingLabel: string;
    itemsCount: number;
  };
}) {
  const settings = getStoreSettings();
  if (!settings.email_notify_owner || !isValidEmail(settings.contact_email)) {
    return {dispatched: false, status: 'skipped_no_smtp' as const};
  }

  const {order} = params;
  const paymentLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod;
  const subject = `[Suzy Bely] Novo pedido ${order.orderNumber} (${formatBrl(order.totalCents)})`;

  const bodyHtml = `
    <h1 style="margin:0 0 10px;font-size:19px;color:#3D2113;">Novo pedido recebido na loja</h1>
    <p style="margin:0 0 14px;font-size:14px;color:#5E3824;">
      Uma nova compra foi registrada no site Suzy Bely.
    </p>
    <div style="background-color:#FFF9F4;border:1px solid #F2D2B6;border-radius:10px;padding:14px 16px;font-size:13px;color:#3D2113;line-height:1.7;">
      <strong>Pedido:</strong> ${escapeHtml(order.orderNumber)}<br />
      <strong>Cliente:</strong> ${escapeHtml(params.customerName)} (${escapeHtml(params.customerEmail)})<br />
      <strong>Quantidade de peças:</strong> ${order.itemsCount}<br />
      <strong>Pagamento:</strong> ${escapeHtml(paymentLabel)}<br />
      <strong>Envio:</strong> ${escapeHtml(order.shippingLabel)}<br />
      <strong>Valor Total:</strong> ${escapeHtml(formatBrl(order.totalCents))}
    </div>
  `;

  const text = `Novo pedido ${order.orderNumber} na Suzy Bely.\nCliente: ${params.customerName} (${params.customerEmail})\nPagamento: ${paymentLabel}\nEnvio: ${order.shippingLabel}\nTotal: ${formatBrl(order.totalCents)}`;

  return dispatchEmail({
    to: settings.contact_email,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, 'Aviso automático do Painel Administrativo Suzy Bely.'),
    eventType: 'owner_new_order',
  });
}

export async function sendOrderStatusEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  status: string;
  trackingCode?: string;
}) {
  const settings = getStoreSettings();
  if (!settings.email_on_status) {
    return {dispatched: false, status: 'skipped_no_smtp' as const};
  }

  const label = STATUS_LABELS[params.status] || params.status;
  const subject = `Atualização do pedido ${params.orderNumber}: ${label}`;
  const storeCity = settings.store_city || 'Ji-Paraná, RO';
  const contactEmail = settings.contact_email || 'atendimento@suzybely.com.br';

  const bodyHtml = `
    <h1 style="margin:0 0 10px;font-size:20px;color:#3D2113;">Atualização do seu pedido</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#5E3824;">
      Olá, <strong>${escapeHtml(params.customerName)}</strong>. O status do pedido <strong>${escapeHtml(params.orderNumber)}</strong> foi atualizado.
    </p>
    <div style="background-color:#FFF9F4;border:1px solid #F2D2B6;border-radius:10px;padding:14px 16px;font-size:14px;color:#3D2113;">
      <strong>Novo status:</strong> <span style="color:#EA580C;">${escapeHtml(label)}</span>
      ${
        params.trackingCode
          ? `<br /><strong>Código de rastreio:</strong> <span style="font-family:monospace;">${escapeHtml(params.trackingCode)}</span>`
          : ''
      }
    </div>
    <p style="margin:14px 0 0;font-size:13px;color:#7A4D35;">
      Você também pode acompanhar todo o histórico na Área do Cliente dentro da loja.
    </p>
  `;

  const text = `Olá, ${params.customerName}.\n\nO pedido ${params.orderNumber} foi atualizado para: ${label}.${params.trackingCode ? `\nCódigo de rastreio: ${params.trackingCode}` : ''}\n\nSuzy Bely Bijuterias · ${storeCity}`;

  return dispatchEmail({
    to: params.to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, `Suzy Bely Bijuterias · ${escapeHtml(storeCity)} · ${escapeHtml(contactEmail)}`),
    eventType: 'order_status',
  });
}

export async function sendPasswordResetEmail(params: {to: string; fullName: string; resetCode: string}) {
  const settings = getStoreSettings();
  const storeCity = settings.store_city || 'Ji-Paraná, RO';
  const contactEmail = settings.contact_email || 'atendimento@suzybely.com.br';
  const subject = 'Código de redefinição de senha — Suzy Bely';

  const bodyHtml = `
    <h1 style="margin:0 0 10px;font-size:20px;color:#3D2113;">Redefinição de senha</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#5E3824;">
      Olá, <strong>${escapeHtml(params.fullName)}</strong>. Use o código abaixo na loja para definir uma nova senha (válido por 30 minutos):
    </p>
    <div style="background-color:#FFF2E6;border:1px solid #EA580C;border-radius:10px;padding:14px 16px;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px;text-align:center;color:#3D2113;">
      ${escapeHtml(params.resetCode)}
    </div>
    <p style="margin:14px 0 0;font-size:12px;color:#7A4D35;">
      Se você não solicitou a troca de senha, ignore este e-mail com segurança.
    </p>
  `;

  const text = `Olá, ${params.fullName}.\n\nSeu código de redefinição de senha na Suzy Bely (válido por 30 minutos):\n${params.resetCode}\n\nSe não foi você, ignore este e-mail.`;

  return dispatchEmail({
    to: params.to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, `Suzy Bely Bijuterias · ${escapeHtml(storeCity)} · ${escapeHtml(contactEmail)}`),
    eventType: 'password_reset',
  });
}

export async function sendTestEmail(params: {to: string}) {
  const settings = getStoreSettings();
  const storeCity = settings.store_city || 'Ji-Paraná, RO';
  const subject = 'Teste de envio SMTP — Suzy Bely Bijuterias';

  const bodyHtml = `
    <h1 style="margin:0 0 10px;font-size:20px;color:#3D2113;">Conexão SMTP funcionando!</h1>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#5E3824;">
      Este é um e-mail de teste enviado pelo Painel Administrativo da <strong>Suzy Bely Bijuterias</strong>. O envio automático para criação de conta, confirmação de pedidos, atualização de status e recuperação de senha está pronto para uso.
    </p>
  `;

  const text = `Conexão SMTP funcionando!\nEste é um e-mail de teste enviado pelo Painel Administrativo da Suzy Bely Bijuterias (${storeCity}).`;

  return dispatchEmail({
    to: params.to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, `Teste administrativo · Suzy Bely · ${escapeHtml(storeCity)}`),
    eventType: 'admin_test',
  });
}
