import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type {Request, Response, NextFunction} from 'express';
import multer from 'multer';
import {createServer as createViteServer} from 'vite';
import {db, getStoreSettings, initDatabase, type StoreSettingsRow} from './server/db.ts';
import {
  getRecentEmailLogs,
  getSmtpSummary,
  isSmtpConfigured,
  sendAccountVerificationCodeEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendOwnerNewOrderAlertEmail,
  sendPasswordResetEmail,
  sendTestEmail,
  sendWelcomeEmail,
} from './server/email.ts';
import {generatePixPayload, type PixKeyType} from './server/pix.ts';
import {
  getRecentSmsLogs,
  getSmsSummary,
  isSmsConfigured,
  sendVerificationSms,
} from './server/sms.ts';
import {
  csrfProtection,
  hashPassword,
  hashResetToken,
  isSafeExternalHttpUrl,
  isSafeImageUrl,
  maskCpf,
  sanitizeText,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type SessionPayload,
} from './server/security.ts';
import {
  BRAZILIAN_UFS,
  calculateFreightByCep,
  formatCep,
  formatCpf,
  isValidCep,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  normalizeInternationalPhone,
  onlyDigits,
} from './server/validators.ts';

initDatabase();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const uploadsProductsDir = path.resolve(uploadsDir, 'products');
const uploadsCategoriesDir = path.resolve(uploadsDir, 'categories');
if (!fs.existsSync(uploadsProductsDir)) {
  fs.mkdirSync(uploadsProductsDir, {recursive: true});
}
if (!fs.existsSync(uploadsCategoriesDir)) {
  fs.mkdirSync(uploadsCategoriesDir, {recursive: true});
}

function detectImageExtension(buffer: Buffer): '.jpg' | '.png' | '.webp' | '.gif' | null {
  if (buffer.length < 12) return null;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return '.png';
  }
  // WEBP (RIFF....WEBP)
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  // GIF
  const gifSig = buffer.subarray(0, 4).toString('ascii');
  if (gifSig === 'GIF8') return '.gif';
  return null;
}

function deletePhysicalProductImageIfUnused(imagePath: string): void {
  if (!imagePath || !imagePath.startsWith('/uploads/products/')) return;
  const filename = imagePath.slice('/uploads/products/'.length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return;

  const refProducts = (
    db.prepare('SELECT COUNT(*) AS count FROM produto_imagens WHERE imagem = ?').get(imagePath) as {count: number}
  ).count;
  const refBanners = (
    db.prepare('SELECT COUNT(*) AS count FROM banners WHERE image_url = ?').get(imagePath) as {count: number}
  ).count;
  if (refProducts > 0 || refBanners > 0) return;

  const resolved = path.resolve(uploadsProductsDir, filename);
  if (!resolved.startsWith(uploadsProductsDir + path.sep)) return;
  try {
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch {
    // Ignore filesystem cleanup race
  }
}

function deletePhysicalCategoryImageIfUnused(imagePath: string): void {
  if (!imagePath || !imagePath.startsWith('/uploads/categories/')) return;
  const filename = imagePath.slice('/uploads/categories/'.length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return;

  const refCategories = (
    db.prepare('SELECT COUNT(*) AS count FROM categories WHERE image_url = ?').get(imagePath) as {count: number}
  ).count;
  if (refCategories > 0) return;

  const resolved = path.resolve(uploadsCategoriesDir, filename);
  if (!resolved.startsWith(uploadsCategoriesDir + path.sep)) return;
  try {
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch {
    // Ignore filesystem cleanup race
  }
}

const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 12,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Envie imagens JPG, PNG, WEBP ou GIF.'));
    }
  },
});

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);
app.use(express.json({limit: '2mb'}));
app.use(
  '/uploads',
  express.static(uploadsDir, {
    maxAge: '30d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers['x-forwarded-proto'];
    const host = String(req.headers.host || '');
    const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    if (proto === 'http' && !isLocalHost && req.path !== '/api/health') {
      res.redirect(301, `https://${host}${req.originalUrl}`);
      return;
    }
    if (req.secure || proto === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  }
  next();
});

// Real-time Server-Sent Events (SSE) clients
const sseClients = new Set<Response>();

function broadcastEvent(event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

interface AuthedRequest extends Request {
  auth?: SessionPayload;
}

function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const payload = verifySessionToken(token);
    if (payload) {
      req.auth = payload;
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({error: 'Autenticação necessária para continuar.'});
    return;
  }
  const userRow = db
    .prepare('SELECT id, active, role FROM users WHERE id = ?')
    .get(req.auth.userId) as {id: number; active: number; role: string} | undefined;
  if (!userRow || !userRow.active) {
    res.status(401).json({error: 'Sessão inválida ou conta desativada.'});
    return;
  }
  next();
}

function requireAdminPermission(permission?: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({error: 'Acesso restrito. Faça login administrativo.'});
      return;
    }
    const userRow = db
      .prepare('SELECT id, active, role, permissions_json FROM users WHERE id = ?')
      .get(req.auth.userId) as {id: number; active: number; role: string; permissions_json: string} | undefined;
    if (!userRow || !userRow.active) {
      res.status(401).json({error: 'Sessão inválida ou conta desativada.'});
      return;
    }
    if (userRow.role !== 'admin' && userRow.role !== 'staff') {
      res.status(403).json({error: 'Permissão insuficiente para acessar o painel.'});
      return;
    }
    const livePermissions = JSON.parse(userRow.permissions_json || '[]') as string[];
    if (userRow.role === 'staff' && permission && !livePermissions.includes(permission)) {
      res.status(403).json({error: 'Seu perfil de colaborador não possui esta permissão.'});
      return;
    }
    req.auth.role = userRow.role as 'admin' | 'staff';
    req.auth.permissions = livePermissions;
    next();
  };
}

function serializePublicSettings(s: StoreSettingsRow) {
  return {
    enablePix: Boolean(s.enable_pix),
    enableCreditCard: Boolean(s.enable_credit_card),
    enableBoleto: Boolean(s.enable_boleto),
    pixDiscountPercent: s.pix_discount_percent,
    maxInstallments: s.max_installments,
    hasRealPixKey: Boolean(s.pix_key.trim()),
    hasExternalPaymentLink: Boolean(s.external_payment_link.trim()),
    mercadoPagoConfigured: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()),
    freeShippingThresholdCents: s.free_shipping_threshold_cents,
    localDeliveryEnabled: Boolean(s.local_delivery_enabled),
    localDeliveryLabel: s.local_delivery_label,
    localDeliveryPriceCents: s.local_delivery_price_cents,
    localDeliveryDays: s.local_delivery_days,
    whatsappNumber: s.whatsapp_number,
    whatsappMessage: s.whatsapp_message,
    contactEmail: s.contact_email,
    storeCity: s.store_city,
    smsConfigured: isSmsConfigured(),
  };
}

function serializeAdminSettings(s: StoreSettingsRow) {
  return {
    enablePix: Boolean(s.enable_pix),
    enableCreditCard: Boolean(s.enable_credit_card),
    enableBoleto: Boolean(s.enable_boleto),
    pixKey: s.pix_key,
    pixKeyType: s.pix_key_type,
    pixMerchantName: s.pix_merchant_name,
    pixMerchantCity: s.pix_merchant_city,
    pixDiscountPercent: s.pix_discount_percent,
    maxInstallments: s.max_installments,
    externalPaymentLink: s.external_payment_link,
    freeShippingThresholdCents: s.free_shipping_threshold_cents,
    shippingMode: s.shipping_mode,
    fixedPacCents: s.fixed_pac_cents,
    fixedSedexCents: s.fixed_sedex_cents,
    shippingExtraDays: s.shipping_extra_days,
    localDeliveryEnabled: Boolean(s.local_delivery_enabled),
    localDeliveryLabel: s.local_delivery_label,
    localDeliveryPriceCents: s.local_delivery_price_cents,
    localDeliveryDays: s.local_delivery_days,
    whatsappNumber: s.whatsapp_number,
    whatsappMessage: s.whatsapp_message,
    contactEmail: s.contact_email,
    storeCity: s.store_city,
    emailSenderName: s.email_sender_name,
    emailOnRegister: Boolean(s.email_on_register),
    emailOnOrder: Boolean(s.email_on_order),
    emailOnStatus: Boolean(s.email_on_status),
    emailNotifyOwner: Boolean(s.email_notify_owner),
    gatewayStatus: {
      mercadoPagoConfigured: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()),
      appUrlConfigured: Boolean(process.env.APP_URL?.trim()),
    },
    emailStatus: getSmtpSummary(),
    smsStatus: getSmsSummary(),
  };
}

function logAudit(
  actorUserId: number | null,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string | number,
  details: string
): void {
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(actorUserId, actorEmail, action, entityType, String(entityId), details);
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseAttributesJson(raw: unknown): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const cleanKey = sanitizeText(k, 60);
      const cleanVal = sanitizeText(String(v ?? ''), 160);
      if (cleanKey && cleanVal) {
        out[cleanKey] = cleanVal;
      }
      if (Object.keys(out).length >= 20) break;
    }
    return out;
  } catch {
    return {};
  }
}

function getCategoriesWithSubcategories(onlyActive: boolean) {
  const catRows = db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.description, c.image_url, c.active, c.sort_order,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id${onlyActive ? ' AND p.active = 1' : ''}) AS product_count
       FROM categories c
       ${onlyActive ? 'WHERE c.active = 1' : ''}
       ORDER BY c.sort_order ASC, c.id ASC`
    )
    .all() as {
      id: number;
      name: string;
      slug: string;
      description: string;
      image_url: string;
      active: number;
      sort_order: number;
      product_count: number;
    }[];

  const subRows = db
    .prepare(
      `SELECT sc.id, sc.category_id, sc.name, sc.slug, sc.description, sc.active, sc.sort_order,
              (SELECT COUNT(*) FROM products p WHERE p.subcategory_id = sc.id${onlyActive ? ' AND p.active = 1' : ''}) AS product_count
       FROM subcategories sc
       ${onlyActive ? 'WHERE sc.active = 1' : ''}
       ORDER BY sc.sort_order ASC, sc.id ASC`
    )
    .all() as {
      id: number;
      category_id: number;
      name: string;
      slug: string;
      description: string;
      active: number;
      sort_order: number;
      product_count: number;
    }[];

  const subMap = new Map<number, Array<{
    id: number;
    category_id: number;
    name: string;
    slug: string;
    description: string;
    active: boolean;
    sort_order: number;
    product_count: number;
  }>>();

  for (const sub of subRows) {
    const list = subMap.get(sub.category_id) || [];
    list.push({
      ...sub,
      active: Boolean(sub.active),
    });
    subMap.set(sub.category_id, list);
  }

  return catRows.map((cat) => ({
    ...cat,
    active: Boolean(cat.active),
    subcategories: subMap.get(cat.id) || [],
  }));
}

function getProductImages(productId: number) {
  const rows = db
    .prepare(
      'SELECT id, produto_id, imagem, alt, principal, ordem, criado_em FROM produto_imagens WHERE produto_id = ? ORDER BY principal DESC, ordem ASC, id ASC'
    )
    .all(productId) as {
      id: number;
      produto_id: number;
      imagem: string;
      alt: string;
      principal: number;
      ordem: number;
      criado_em: string;
    }[];

  return rows.map((img) => ({
    id: img.id,
    produto_id: img.produto_id,
    url: img.imagem,
    imagem: img.imagem,
    alt: img.alt,
    principal: Boolean(img.principal),
    ordem: img.ordem,
    sort_order: img.ordem,
    criado_em: img.criado_em,
  }));
}

function enrichProducts(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return [];
  return rows.map((row) => ({
    ...row,
    brand: String(row.brand || ''),
    sku: String(row.sku || ''),
    subcategory_id: row.subcategory_id !== null && row.subcategory_id !== undefined ? Number(row.subcategory_id) : null,
    subcategory_name: row.subcategory_name ? String(row.subcategory_name) : null,
    subcategory_slug: row.subcategory_slug ? String(row.subcategory_slug) : null,
    attributes: parseAttributesJson(row.attributes_json),
    is_featured: Boolean(row.is_featured),
    is_new: Boolean(row.is_new),
    is_bestseller: Boolean(row.is_bestseller),
    active: Boolean(row.active),
    images: getProductImages(Number(row.id)),
  }));
}

// SSE stream
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write('event: connected\ndata: {"ok":true}\n\n');
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Server-to-server Mercado Pago Webhook (verified directly via Mercado Pago API)
app.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) {
    res.status(200).json({received: true, ignored: 'gateway_not_configured'});
    return;
  }

  const rawId = req.body?.data?.id ?? req.query['data.id'] ?? req.query.id;
  const paymentId = String(rawId || '').replace(/\D/g, '');
  const topic = String(req.body?.type || req.query.topic || req.query.type || '');

  if (!paymentId || (topic && topic !== 'payment')) {
    res.status(200).json({received: true});
    return;
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {Authorization: `Bearer ${mpToken}`},
    });
    if (!mpRes.ok) {
      res.status(200).json({received: true});
      return;
    }
    const mpData = (await mpRes.json()) as {
      id?: number | string;
      status?: string;
      external_reference?: string;
    };

    if (mpData.status === 'approved') {
      const orderRow = db
        .prepare(
          `SELECT o.id, o.order_number, o.status
           FROM orders o
           LEFT JOIN payments p ON p.order_id = o.id
           WHERE o.order_number = ? OR p.external_id = ?
           LIMIT 1`
        )
        .get(String(mpData.external_reference || ''), String(mpData.id || paymentId)) as
        | {id: number; order_number: string; status: string}
        | undefined;

      if (orderRow && orderRow.status === 'aguardando_pagamento') {
        db.transaction(() => {
          db.prepare("UPDATE orders SET status = 'pago', payment_status = 'approved', updated_at = datetime('now') WHERE id = ?").run(orderRow.id);
          db.prepare("UPDATE payments SET status = 'approved', external_id = ? WHERE order_id = ?").run(
            String(mpData.id || paymentId),
            orderRow.id
          );
          db.prepare("UPDATE shipments SET status = 'em_separacao', updated_at = datetime('now') WHERE order_id = ?").run(orderRow.id);
          logAudit(null, 'mercadopago@webhook', 'WEBHOOK_PAYMENT_APPROVED', 'order', orderRow.id, `Pagamento aprovado via Mercado Pago (${orderRow.order_number})`);
        })();
        broadcastEvent('order_updated', {orderId: orderRow.id, status: 'pago'});

        const customer = db
          .prepare(
            `SELECT u.email, u.full_name
             FROM orders o
             JOIN users u ON u.id = o.user_id
             WHERE o.id = ?`
          )
          .get(orderRow.id) as {email: string; full_name: string} | undefined;
        if (customer) {
          void sendOrderStatusEmail({
            to: customer.email,
            customerName: customer.full_name,
            orderNumber: orderRow.order_number,
            status: 'pago',
          });
        }
      }
    }
  } catch {
    // Always acknowledge webhook gracefully
  }

  res.status(200).json({received: true});
});

app.use('/api', attachAuth);
app.use('/api', csrfProtection);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({status: 'ok', store: 'Suzy Bely Loja Feminina'});
});

app.get('/api/settings/public', (_req: Request, res: Response) => {
  res.json({storeSettings: serializePublicSettings(getStoreSettings())});
});

// Public Storefront Catalog (100% dynamic from database)
app.get('/api/catalog', (_req: Request, res: Response) => {
  const categories = getCategoriesWithSubcategories(true);

  const rawProducts = db
    .prepare(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug,
             sc.name AS subcategory_name, sc.slug AS subcategory_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
      WHERE p.active = 1 AND c.active = 1 AND (p.subcategory_id IS NULL OR sc.active = 1)
      ORDER BY p.is_featured DESC, p.id DESC
    `)
    .all() as Record<string, unknown>[];

  const banners = db
    .prepare('SELECT id, title, subtitle, cta_text, cta_category, image_url, active, sort_order FROM banners WHERE active = 1 ORDER BY sort_order ASC, id ASC')
    .all();

  const testimonials = db
    .prepare('SELECT id, author_name, author_city, rating, comment, product_name FROM testimonials WHERE active = 1 ORDER BY id ASC')
    .all();

  res.json({
    categories,
    products: enrichProducts(rawProducts),
    banners,
    testimonials,
    storeSettings: serializePublicSettings(getStoreSettings()),
  });
});

app.get('/api/products', (req: Request, res: Response) => {
  const category = sanitizeText(req.query.category, 60);
  const subcategory = sanitizeText(req.query.subcategory, 80);
  const search = sanitizeText(req.query.search, 100);
  const inStock = req.query.inStock === 'true';
  const onlyNew = req.query.isNew === 'true';
  const onlyPromo = req.query.isPromo === 'true';
  const minPrice = Number(req.query.minPrice) || 0;
  const maxPrice = Number(req.query.maxPrice) || 0;
  const sort = sanitizeText(req.query.sort, 30);

  const where: string[] = [
    'p.active = 1',
    'c.active = 1',
    '(p.subcategory_id IS NULL OR sc.active = 1)',
  ];
  const params: unknown[] = [];

  if (category && category !== 'all') {
    if (category === 'promocoes') {
      where.push('p.promo_price_cents IS NOT NULL AND p.promo_price_cents < p.price_cents');
    } else if (category === 'lancamentos') {
      where.push('p.is_new = 1');
    } else {
      where.push('c.slug = ?');
      params.push(category);
    }
  }

  if (subcategory && subcategory !== 'all') {
    where.push('sc.slug = ?');
    params.push(subcategory);
  }

  if (search) {
    where.push(`(
      LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.material) LIKE ? OR
      LOWER(p.color) LIKE ? OR LOWER(p.brand) LIKE ? OR LOWER(p.sku) LIKE ? OR
      LOWER(p.attributes_json) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(COALESCE(sc.name, '')) LIKE ?
    )`);
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }

  if (inStock) {
    where.push('p.stock > 0');
  }
  if (onlyNew) {
    where.push('p.is_new = 1');
  }
  if (onlyPromo) {
    where.push('p.promo_price_cents IS NOT NULL AND p.promo_price_cents < p.price_cents');
  }
  if (minPrice > 0) {
    where.push('COALESCE(p.promo_price_cents, p.price_cents) >= ?');
    params.push(Math.round(minPrice * 100));
  }
  if (maxPrice > 0) {
    where.push('COALESCE(p.promo_price_cents, p.price_cents) <= ?');
    params.push(Math.round(maxPrice * 100));
  }

  let orderBy = 'p.is_featured DESC, p.id DESC';
  if (sort === 'price_asc') orderBy = 'COALESCE(p.promo_price_cents, p.price_cents) ASC';
  else if (sort === 'price_desc') orderBy = 'COALESCE(p.promo_price_cents, p.price_cents) DESC';
  else if (sort === 'bestseller') orderBy = 'p.is_bestseller DESC, p.sales_count DESC';
  else if (sort === 'newest') orderBy = 'p.is_new DESC, p.id DESC';

  const sql = `
    SELECT p.*, c.name AS category_name, c.slug AS category_slug,
           sc.name AS subcategory_name, sc.slug AS subcategory_slug
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
  `;

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  res.json({products: enrichProducts(rows)});
});

app.get('/api/products/:idOrSlug', (req: Request, res: Response) => {
  const param = sanitizeText(req.params.idOrSlug, 100);
  const isNumeric = /^\d+$/.test(param);
  const row = db
    .prepare(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug,
             sc.name AS subcategory_name, sc.slug AS subcategory_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
      WHERE p.active = 1 AND c.active = 1 AND (p.subcategory_id IS NULL OR sc.active = 1)
        AND ${isNumeric ? 'p.id = ?' : 'p.slug = ?'}
    `)
    .get(isNumeric ? Number(param) : param) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }

  const relatedRows = db
    .prepare(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug,
             sc.name AS subcategory_name, sc.slug AS subcategory_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
      WHERE p.active = 1 AND c.active = 1 AND (p.subcategory_id IS NULL OR sc.active = 1)
        AND p.id != ? AND p.category_id = ?
      ORDER BY p.is_featured DESC, p.id DESC
      LIMIT 4
    `)
    .all(row.id, row.category_id) as Record<string, unknown>[];

  res.json({
    product: enrichProducts([row])[0],
    related: enrichProducts(relatedRows),
  });
});

// ViaCEP Proxy (fixed host https://viacep.com.br, strict 8-digit validation)
app.get('/api/cep/:cep', async (req: Request, res: Response) => {
  const digits = onlyDigits(String(req.params.cep || ''));
  if (!isValidCep(digits)) {
    res.status(400).json({error: 'CEP inválido. Informe os 8 dígitos no formato 00000-000.'});
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal,
      headers: {Accept: 'application/json'},
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as {
        erro?: boolean;
        cep?: string;
        logradouro?: string;
        complemento?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        res.status(404).json({error: 'CEP não encontrado na base dos Correios.'});
        return;
      }
      res.json({
        cep: formatCep(digits),
        street: sanitizeText(data.logradouro || '', 150),
        complement: sanitizeText(data.complemento || '', 100),
        neighborhood: sanitizeText(data.bairro || '', 100),
        city: sanitizeText(data.localidade || '', 100),
        state: sanitizeText(data.uf || '', 2).toUpperCase(),
      });
      return;
    }
  } catch {
    // Graceful fallback if offline in isolated sandbox
  }

  res.json({
    cep: formatCep(digits),
    street: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    manualFallback: true,
  });
});

app.post('/api/shipping/calculate', (req: Request, res: Response) => {
  const cepDigits = onlyDigits(String(req.body?.cep || ''));
  const subtotalCents = Math.max(0, Math.round(Number(req.body?.subtotalCents) || 0));

  if (!isValidCep(cepDigits)) {
    res.status(400).json({error: 'Informe um CEP válido com 8 dígitos.'});
    return;
  }

  const settings = getStoreSettings();
  const freight = calculateFreightByCep(cepDigits, subtotalCents, {
    freeShippingThresholdCents: settings.free_shipping_threshold_cents,
    shippingMode: settings.shipping_mode,
    fixedPacCents: settings.fixed_pac_cents,
    fixedSedexCents: settings.fixed_sedex_cents,
    shippingExtraDays: settings.shipping_extra_days,
  });

  const options: Record<string, unknown>[] = [];
  if (settings.local_delivery_enabled) {
    options.push({
      id: 'local',
      name: settings.local_delivery_label || 'Entrega Local / Retirada (Ji-Paraná, RO)',
      carrier: 'Loja Suzy Bely',
      service: 'LOCAL',
      priceCents: Math.max(0, settings.local_delivery_price_cents),
      estimatedDays: Math.max(1, settings.local_delivery_days),
    });
  }

  options.push(
    {
      id: 'pac',
      name: freight.freeEligible ? 'Frete Grátis (PAC)' : 'Correios PAC',
      carrier: 'Correios',
      service: 'PAC',
      priceCents: freight.pacCents,
      estimatedDays: freight.pacDays,
    },
    {
      id: 'sedex',
      name: 'Correios SEDEX Expresso',
      carrier: 'Correios',
      service: 'SEDEX',
      priceCents: freight.sedexCents,
      estimatedDays: freight.sedexDays,
    }
  );

  res.json({
    cep: formatCep(cepDigits),
    regionLabel: freight.regionLabel,
    freeEligible: freight.freeEligible,
    options,
  });
});

// Cart Persistence
app.post('/api/cart/sync', (req: AuthedRequest, res: Response) => {
  const sessionKey = sanitizeText(req.body?.sessionKey, 80);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!sessionKey) {
    res.status(400).json({error: 'Identificador de carrinho ausente.'});
    return;
  }

  const tx = db.transaction(() => {
    let cart = db.prepare('SELECT id FROM carts WHERE session_key = ?').get(sessionKey) as {id: number} | undefined;
    if (!cart) {
      const info = db
        .prepare('INSERT INTO carts (session_key, user_id) VALUES (?, ?)')
        .run(sessionKey, req.auth?.userId ?? null);
      cart = {id: Number(info.lastInsertRowid)};
    } else if (req.auth?.userId) {
      db.prepare("UPDATE carts SET user_id = ?, updated_at = datetime('now') WHERE id = ?").run(
        req.auth.userId,
        cart.id
      );
    }

    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    const insertItem = db.prepare(
      'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)'
    );

    for (const item of items) {
      const productId = Number(item?.productId);
      const quantity = Math.max(1, Math.min(99, Math.round(Number(item?.quantity) || 1)));
      if (!Number.isInteger(productId) || productId <= 0) continue;
      const exists = db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(productId);
      if (exists) {
        insertItem.run(cart.id, productId, quantity);
      }
    }
  });

  tx();
  res.json({ok: true});
});

function maskVerificationTarget(channel: 'email' | 'sms', value: string): string {
  if (channel === 'email') {
    const [local, domain] = value.split('@');
    if (!domain) return value;
    const shown = local.slice(0, 2);
    return `${shown}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return value;
  return `+${digits.slice(0, 2)} ****-${digits.slice(-4)}`;
}

async function issueAccountVerificationCode(params: {
  userId: number;
  fullName: string;
  email: string;
  phoneE164: string;
  channel: 'email' | 'sms';
  bypassCooldown?: boolean;
}): Promise<{
  ok: boolean;
  statusCode?: number;
  error?: string;
  retryAfterSeconds?: number;
  dispatched: boolean;
  previewCode?: string;
}> {
  if (!params.bypassCooldown) {
    const latest = db
      .prepare(
        `SELECT CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) AS age_seconds
         FROM account_verifications
         WHERE user_id = ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(params.userId) as {age_seconds: number} | undefined;

    if (latest && latest.age_seconds < 60) {
      const wait = Math.max(1, 60 - latest.age_seconds);
      return {
        ok: false,
        statusCode: 429,
        retryAfterSeconds: wait,
        dispatched: false,
        error: `Aguarde ${wait} segundo(s) antes de solicitar um novo código.`,
      };
    }

    const recentCount = (
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM account_verifications WHERE user_id = ? AND created_at >= datetime('now', '-60 minutes')"
        )
        .get(params.userId) as {count: number}
    ).count;

    if (recentCount >= 5) {
      return {
        ok: false,
        statusCode: 429,
        retryAfterSeconds: 600,
        dispatched: false,
        error: 'Limite de reenvios atingido nesta hora. Tente novamente em alguns minutos.',
      };
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashResetToken(`${code}:${params.userId}`);
  const target = params.channel === 'sms' ? params.phoneE164 : params.email;

  db.transaction(() => {
    db.prepare('UPDATE account_verifications SET used = 1 WHERE user_id = ? AND used = 0').run(params.userId);
    db.prepare(
      `INSERT INTO account_verifications (user_id, channel, target, code_hash, attempts, max_attempts, expires_at)
       VALUES (?, ?, ?, ?, 0, 5, datetime('now', '+5 minutes'))`
    ).run(params.userId, params.channel, target, codeHash);
    db.prepare("UPDATE users SET verification_channel = ?, updated_at = datetime('now') WHERE id = ?").run(
      params.channel,
      params.userId
    );
  })();

  const isProd = process.env.NODE_ENV === 'production';

  if (params.channel === 'email') {
    // Email is primary & free — never send SMS when email is selected
    const emailRes = await sendAccountVerificationCodeEmail({
      to: params.email,
      fullName: params.fullName,
      code,
    });
    if (emailRes.dispatched) {
      return {ok: true, dispatched: true};
    }
    if (!isProd) {
      return {ok: true, dispatched: false, previewCode: code};
    }
    return {
      ok: false,
      statusCode: 502,
      dispatched: false,
      error: emailRes.errorMessage || 'Não foi possível enviar o código por e-mail no momento.',
    };
  }

  // Optional SMS channel via external provider (+55 / +351)
  const smsRes = await sendVerificationSms({
    toE164: params.phoneE164,
    fullName: params.fullName,
    code,
  });
  if (smsRes.dispatched) {
    return {ok: true, dispatched: true};
  }
  if (!isProd && smsRes.status === 'skipped_no_provider') {
    return {ok: true, dispatched: false, previewCode: code};
  }
  return {
    ok: false,
    statusCode: smsRes.status === 'skipped_no_provider' ? 400 : 502,
    dispatched: false,
    error:
      smsRes.errorMessage ||
      'Serviço externo de SMS indisponível no momento. Utilize a verificação gratuita por e-mail.',
  };
}

// Customer Auth Routes
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const body = req.body || {};
  const fullName = sanitizeText(body.fullName, 120);
  const cpfDigits = onlyDigits(String(body.cpf || ''));
  const email = sanitizeText(body.email, 140).toLowerCase();
  const phoneCountry = body.phoneCountry === 'PT' || body.phoneCountry === '+351' ? 'PT' : 'BR';
  const normalizedPhone = normalizeInternationalPhone(String(body.phone || ''), phoneCountry);
  const verificationChannel: 'email' | 'sms' = body.verificationChannel === 'sms' ? 'sms' : 'email';
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const lgpdConsent = Boolean(body.lgpdConsent);

  const cepDigits = onlyDigits(String(body.cep || ''));
  const street = sanitizeText(body.street, 150);
  const number = sanitizeText(body.number, 20);
  const complement = sanitizeText(body.complement, 100);
  const neighborhood = sanitizeText(body.neighborhood, 100);
  const city = sanitizeText(body.city, 100);
  const state = sanitizeText(body.state, 2).toUpperCase();

  if (fullName.length < 3) {
    res.status(400).json({error: 'Informe seu nome completo.'});
    return;
  }
  if (!isValidCpf(cpfDigits)) {
    res.status(400).json({error: 'CPF inválido. Verifique os dígitos informados.'});
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({error: 'Informe um endereço de e-mail válido.'});
    return;
  }
  if (!normalizedPhone.valid) {
    res.status(400).json({
      error:
        phoneCountry === 'PT'
          ? 'Informe um telemóvel válido de Portugal (+351 com 9 dígitos).'
          : 'Informe um celular válido do Brasil (+55 com DDD e 10 ou 11 dígitos).',
    });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({error: 'A senha deve conter no mínimo 6 caracteres.'});
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({error: 'A confirmação de senha não confere.'});
    return;
  }
  if (!isValidCep(cepDigits) || !street || !number || !neighborhood || !city || !BRAZILIAN_UFS.has(state)) {
    res.status(400).json({error: 'Preencha todos os campos obrigatórios do endereço brasileiro (CEP, Rua, Número, Bairro, Cidade e UF).'});
    return;
  }
  if (!lgpdConsent) {
    res.status(400).json({error: 'É necessário aceitar a Política de Privacidade (LGPD) para criar sua conta.'});
    return;
  }

  const existingEmail = db
    .prepare('SELECT id, account_verified, created_at FROM users WHERE email = ?')
    .get(email) as {id: number; account_verified: number; created_at: string} | undefined;
  if (existingEmail) {
    if (existingEmail.account_verified) {
      res.status(409).json({error: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.'});
      return;
    }
    // Remove stale unverified pending registration (>15 min) so genuine owner can re-register
    const stale = db
      .prepare("SELECT 1 AS is_stale FROM users WHERE id = ? AND created_at < datetime('now', '-15 minutes')")
      .get(existingEmail.id);
    if (!stale) {
      res.status(409).json({
        error: 'Este e-mail possui um cadastro pendente de confirmação. Informe o código de 6 dígitos enviado ou clique em reenviar.',
        requiresVerification: true,
        email,
      });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ? AND account_verified = 0').run(existingEmail.id);
  }

  const existingCpf = db
    .prepare('SELECT id, account_verified FROM users WHERE cpf = ?')
    .get(cpfDigits) as {id: number; account_verified: number} | undefined;
  if (existingCpf) {
    if (existingCpf.account_verified) {
      res.status(409).json({error: 'Este CPF já possui cadastro na loja.'});
      return;
    }
    const staleCpf = db
      .prepare("SELECT 1 AS is_stale FROM users WHERE id = ? AND created_at < datetime('now', '-15 minutes')")
      .get(existingCpf.id);
    if (!staleCpf) {
      res.status(409).json({error: 'Este CPF possui um cadastro aguardando confirmação de código.'});
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ? AND account_verified = 0').run(existingCpf.id);
  }

  const passwordHash = hashPassword(password);

  let createdUserId = 0;
  const tx = db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO users (
          role, permissions_json, full_name, cpf, email, phone, password_hash,
          lgpd_consent, lgpd_consent_at, email_verified, phone_verified, verification_channel, account_verified, active
        )
        VALUES ('customer', '[]', ?, ?, ?, ?, ?, 1, datetime('now'), 0, 0, ?, 0, 0)
      `)
      .run(fullName, cpfDigits, email, normalizedPhone.e164, passwordHash, verificationChannel);
    createdUserId = Number(info.lastInsertRowid);

    db.prepare(`
      INSERT INTO addresses (user_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
      VALUES (?, 'Principal', ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(createdUserId, formatCep(cepDigits), street, number, complement, neighborhood, city, state);
  });

  tx();

  const verificationResult = await issueAccountVerificationCode({
    userId: createdUserId,
    fullName,
    email,
    phoneE164: normalizedPhone.e164,
    channel: verificationChannel,
    bypassCooldown: true,
  });

  if (!verificationResult.ok) {
    res.status(verificationResult.statusCode || 500).json({
      error: verificationResult.error || 'Não foi possível enviar o código de confirmação.',
      requiresVerification: true,
      email,
    });
    return;
  }

  res.status(201).json({
    requiresVerification: true,
    channel: verificationChannel,
    email,
    maskedTarget: maskVerificationTarget(
      verificationChannel,
      verificationChannel === 'sms' ? normalizedPhone.e164 : email
    ),
    expiresInSeconds: 300,
    retryAfterSeconds: 60,
    dispatched: verificationResult.dispatched,
    previewCode: verificationResult.previewCode,
    smsCostNotice: verificationChannel === 'sms',
    message:
      verificationChannel === 'email'
        ? 'Cadastro iniciado! Enviamos um código de 6 dígitos para o seu e-mail (válido por 5 minutos).'
        : 'Cadastro iniciado! Código de 6 dígitos enviado via SMS (serviço externo com eventuais custos operacionais, válido por 5 minutos).',
  });
});

app.post('/api/auth/verify-account', async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  const code = onlyDigits(String(req.body?.code || '')).slice(0, 6);

  if (!isValidEmail(email) || code.length !== 6) {
    res.status(400).json({error: 'Informe o e-mail e o código numérico de 6 dígitos.'});
    return;
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email = ? AND role = ?')
    .get(email, 'customer') as {
      id: number;
      role: 'customer';
      permissions_json: string;
      full_name: string;
      cpf: string | null;
      email: string;
      phone: string;
      account_verified: number;
      active: number;
    } | undefined;

  if (!user) {
    res.status(404).json({error: 'Cadastro não encontrado para este e-mail.'});
    return;
  }

  if (user.account_verified && user.active) {
    res.status(400).json({error: 'Esta conta já foi confirmada. Faça login normalmente.'});
    return;
  }

  const record = db
    .prepare(
      `SELECT id, channel, code_hash, attempts, max_attempts,
              CASE WHEN expires_at <= datetime('now') THEN 1 ELSE 0 END AS is_expired
       FROM account_verifications
       WHERE user_id = ? AND used = 0
       ORDER BY id DESC LIMIT 1`
    )
    .get(user.id) as {
      id: number;
      channel: 'email' | 'sms';
      code_hash: string;
      attempts: number;
      max_attempts: number;
      is_expired: number;
    } | undefined;

  if (!record) {
    res.status(400).json({error: 'Nenhum código ativo encontrado. Solicite o reenvio de um novo código.'});
    return;
  }

  if (record.is_expired) {
    db.prepare('UPDATE account_verifications SET used = 1 WHERE id = ?').run(record.id);
    res.status(400).json({error: 'O código de 6 dígitos expirou (validade de 5 minutos). Solicite o reenvio.'});
    return;
  }

  if (record.attempts >= record.max_attempts) {
    db.prepare('UPDATE account_verifications SET used = 1 WHERE id = ?').run(record.id);
    res.status(429).json({error: 'Número máximo de tentativas atingido para este código. Solicite um novo código.'});
    return;
  }

  const expectedHash = hashResetToken(`${code}:${user.id}`);
  const actualBuf = Buffer.from(expectedHash, 'utf8');
  const storedBuf = Buffer.from(record.code_hash, 'utf8');
  const matched = actualBuf.length === storedBuf.length && crypto.timingSafeEqual(actualBuf, storedBuf);

  if (!matched) {
    const nextAttempts = record.attempts + 1;
    const exhausted = nextAttempts >= record.max_attempts;
    db.prepare('UPDATE account_verifications SET attempts = ?, used = ? WHERE id = ?').run(
      nextAttempts,
      exhausted ? 1 : 0,
      record.id
    );
    const remaining = Math.max(0, record.max_attempts - nextAttempts);
    res.status(exhausted ? 429 : 400).json({
      error: exhausted
        ? 'Tentativas esgotadas para este código. Clique em "Reenviar código" para gerar um novo.'
        : `Código incorreto. Você ainda tem ${remaining} tentativa(s).`,
      attemptsRemaining: remaining,
    });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE account_verifications SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
    db.prepare(
      `UPDATE users SET
         active = 1,
         account_verified = 1,
         email_verified = CASE WHEN ? = 'email' THEN 1 ELSE email_verified END,
         phone_verified = CASE WHEN ? = 'sms' THEN 1 ELSE phone_verified END,
         verification_channel = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(record.channel, record.channel, record.channel, user.id);
  })();

  const token = signSessionToken({
    userId: user.id,
    role: 'customer',
    email: user.email,
    permissions: [],
  });

  const addresses = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(user.id);

  const welcomeRes = await sendWelcomeEmail({to: user.email, fullName: user.full_name});

  res.json({
    token,
    user: {
      id: user.id,
      role: 'customer',
      fullName: user.full_name,
      cpfMasked: user.cpf ? maskCpf(user.cpf) : null,
      email: user.email,
      phone: user.phone,
      permissions: [],
      accountVerified: true,
      verificationChannel: record.channel,
    },
    addresses,
    emailDispatched: welcomeRes.dispatched,
    message: 'Conta confirmada e ativada com sucesso!',
  });
});

app.post('/api/auth/resend-verification', async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  const requestedChannel: 'email' | 'sms' = req.body?.channel === 'sms' ? 'sms' : 'email';
  const rawPhone = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const phoneCountry = req.body?.phoneCountry === 'PT' || req.body?.phoneCountry === '+351' ? 'PT' : 'BR';

  if (!isValidEmail(email)) {
    res.status(400).json({error: 'Informe um endereço de e-mail válido.'});
    return;
  }

  const user = db
    .prepare('SELECT id, full_name, email, phone, account_verified FROM users WHERE email = ? AND role = ?')
    .get(email, 'customer') as {
      id: number;
      full_name: string;
      email: string;
      phone: string;
      account_verified: number;
    } | undefined;

  if (!user) {
    res.status(404).json({error: 'Cadastro não encontrado para este e-mail.'});
    return;
  }

  if (user.account_verified) {
    res.status(400).json({error: 'Esta conta já está confirmada e ativa.'});
    return;
  }

  let targetPhone = user.phone;
  if (requestedChannel === 'sms') {
    const candidate = rawPhone.trim() || user.phone;
    const norm = normalizeInternationalPhone(
      candidate,
      rawPhone.trim() ? phoneCountry : candidate.startsWith('+351') ? 'PT' : 'BR'
    );
    if (!norm.valid) {
      res.status(400).json({
        error: 'Informe um número válido do Brasil (+55) ou de Portugal (+351) para envio por SMS.',
      });
      return;
    }
    targetPhone = norm.e164;
    if (targetPhone !== user.phone) {
      db.prepare("UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?").run(targetPhone, user.id);
    }
  }

  const result = await issueAccountVerificationCode({
    userId: user.id,
    fullName: user.full_name,
    email: user.email,
    phoneE164: targetPhone,
    channel: requestedChannel,
  });

  if (!result.ok) {
    res.status(result.statusCode || 429).json({
      error: result.error || 'Não foi possível reenviar o código.',
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return;
  }

  res.json({
    ok: true,
    channel: requestedChannel,
    maskedTarget: maskVerificationTarget(requestedChannel, requestedChannel === 'sms' ? targetPhone : user.email),
    expiresInSeconds: 300,
    retryAfterSeconds: 60,
    dispatched: result.dispatched,
    previewCode: result.previewCode,
    smsCostNotice: requestedChannel === 'sms',
    message:
      requestedChannel === 'email'
        ? 'Novo código de 6 dígitos enviado gratuitamente para o seu e-mail (válido por 5 minutos).'
        : 'Novo código de 6 dígitos enviado via SMS (serviço externo sujeito a custos operacionais, válido por 5 minutos).',
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  const password = String(req.body?.password || '');

  if (!isValidEmail(email) || !password) {
    res.status(400).json({error: 'Informe e-mail e senha para entrar.'});
    return;
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email) as {
      id: number;
      role: 'customer' | 'admin' | 'staff';
      permissions_json: string;
      full_name: string;
      cpf: string | null;
      email: string;
      phone: string;
      password_hash: string;
      account_verified: number;
      verification_channel: string;
      active: number;
    } | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({error: 'E-mail ou senha incorretos.'});
    return;
  }

  if (user.role === 'customer' && !user.account_verified) {
    const channel: 'email' | 'sms' = user.verification_channel === 'sms' ? 'sms' : 'email';
    res.status(403).json({
      error: 'Sua conta ainda não foi confirmada. Digite o código de 6 dígitos ou solicite o reenvio para ativá-la.',
      requiresVerification: true,
      email: user.email,
      channel,
      maskedTarget: maskVerificationTarget(channel, channel === 'sms' ? user.phone : user.email),
    });
    return;
  }

  if (!user.active) {
    res.status(401).json({error: 'Conta desativada.'});
    return;
  }

  const permissions = JSON.parse(user.permissions_json || '[]') as string[];
  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    permissions,
  });

  const addresses = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(user.id);

  res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.full_name,
      cpfMasked: user.cpf ? maskCpf(user.cpf) : null,
      email: user.email,
      phone: user.phone,
      permissions,
      accountVerified: Boolean(user.account_verified),
    },
    addresses,
  });
});

app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({error: 'Informe um e-mail válido.'});
    return;
  }

  const user = db
    .prepare('SELECT id, full_name FROM users WHERE email = ? AND active = 1')
    .get(email) as {id: number; full_name: string} | undefined;
  if (!user) {
    // Do not reveal account existence
    res.json({
      message: 'Se este e-mail estiver cadastrado, enviaremos as instruções de redefinição de senha.',
    });
    return;
  }

  const rawToken = crypto.randomBytes(20).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  db.prepare(
    "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+30 minutes'))"
  ).run(user.id, tokenHash);

  if (isSmtpConfigured()) {
    const emailResult = await sendPasswordResetEmail({
      to: email,
      fullName: user.full_name,
      resetCode: rawToken,
    });
    if (emailResult.dispatched) {
      res.json({
        message: 'Se este e-mail estiver cadastrado, enviamos o código de recuperação para a sua caixa de entrada (válido por 30 minutos).',
        emailDispatched: true,
      });
      return;
    }
  }

  // Fallback when SMTP is unavailable or fails in preview
  res.json({
    message: 'Código de recuperação gerado com validade de 30 minutos.',
    previewResetCode: rawToken,
    emailDispatched: false,
  });
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const code = sanitizeText(req.body?.code, 100);
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!code) {
    res.status(400).json({error: 'Informe o código de recuperação.'});
    return;
  }
  if (newPassword.length < 6 || newPassword !== confirmPassword) {
    res.status(400).json({error: 'A nova senha deve ter ao menos 6 caracteres e coincidir com a confirmação.'});
    return;
  }

  const tokenHash = hashResetToken(code);
  const reset = db
    .prepare(
      "SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1"
    )
    .get(tokenHash) as {id: number; user_id: number} | undefined;

  if (!reset) {
    res.status(400).json({error: 'Código de recuperação inválido ou expirado.'});
    return;
  }

  const newHash = hashPassword(newPassword);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      newHash,
      reset.user_id
    );
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  })();

  res.json({message: 'Senha atualizada com sucesso! Agora você já pode entrar.'});
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
  const user = db
    .prepare('SELECT id, role, permissions_json, full_name, cpf, email, phone, created_at FROM users WHERE id = ?')
    .get(req.auth!.userId) as {
      id: number;
      role: 'customer' | 'admin' | 'staff';
      permissions_json: string;
      full_name: string;
      cpf: string | null;
      email: string;
      phone: string;
      created_at: string;
    } | undefined;

  if (!user) {
    res.status(404).json({error: 'Usuário não encontrado.'});
    return;
  }

  const addresses = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(user.id);

  res.json({
    user: {
      id: user.id,
      role: user.role,
      fullName: user.full_name,
      cpfMasked: user.cpf ? maskCpf(user.cpf) : null,
      email: user.email,
      phone: user.phone,
      permissions: JSON.parse(user.permissions_json || '[]'),
      createdAt: user.created_at,
    },
    addresses,
  });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.json({ok: true});
});

// Customer Private Area Routes
app.put('/api/account/profile', requireAuth, (req: AuthedRequest, res: Response) => {
  const fullName = sanitizeText(req.body?.fullName, 120);
  const rawPhone = String(req.body?.phone || '');
  const preferPT = req.body?.phoneCountry === 'PT' || req.body?.phoneCountry === '+351' || rawPhone.trim().startsWith('+351');
  const norm = normalizeInternationalPhone(rawPhone, preferPT ? 'PT' : 'BR');
  if (fullName.length < 3 || !norm.valid) {
    res.status(400).json({error: 'Informe nome completo válido e telefone válido (+55 Brasil ou +351 Portugal).'});
    return;
  }

  db.prepare("UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?").run(
    fullName,
    norm.e164,
    req.auth!.userId
  );

  res.json({message: 'Dados pessoais atualizados com sucesso.', fullName, phone: norm.e164});
});

app.post('/api/account/addresses', requireAuth, (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const label = sanitizeText(b.label || 'Endereço', 40);
  const cepDigits = onlyDigits(String(b.cep || ''));
  const street = sanitizeText(b.street, 150);
  const number = sanitizeText(b.number, 20);
  const complement = sanitizeText(b.complement, 100);
  const neighborhood = sanitizeText(b.neighborhood, 100);
  const city = sanitizeText(b.city, 100);
  const state = sanitizeText(b.state, 2).toUpperCase();
  const isDefault = Boolean(b.isDefault);

  if (!isValidCep(cepDigits) || !street || !number || !neighborhood || !city || !BRAZILIAN_UFS.has(state)) {
    res.status(400).json({error: 'Preencha todos os campos obrigatórios do endereço.'});
    return;
  }

  db.transaction(() => {
    if (isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.auth!.userId);
    }
    db.prepare(`
      INSERT INTO addresses (user_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.auth!.userId, label, formatCep(cepDigits), street, number, complement, neighborhood, city, state, isDefault ? 1 : 0);
  })();

  const addresses = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(req.auth!.userId);
  res.status(201).json({addresses});
});

app.put('/api/account/addresses/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const addressId = Number(req.params.id);
  const owned = db
    .prepare('SELECT id FROM addresses WHERE id = ? AND user_id = ?')
    .get(addressId, req.auth!.userId);
  if (!owned) {
    res.status(404).json({error: 'Endereço não encontrado.'});
    return;
  }

  const b = req.body || {};
  const label = sanitizeText(b.label || 'Endereço', 40);
  const cepDigits = onlyDigits(String(b.cep || ''));
  const street = sanitizeText(b.street, 150);
  const number = sanitizeText(b.number, 20);
  const complement = sanitizeText(b.complement, 100);
  const neighborhood = sanitizeText(b.neighborhood, 100);
  const city = sanitizeText(b.city, 100);
  const state = sanitizeText(b.state, 2).toUpperCase();
  const isDefault = Boolean(b.isDefault);

  if (!isValidCep(cepDigits) || !street || !number || !neighborhood || !city || !BRAZILIAN_UFS.has(state)) {
    res.status(400).json({error: 'Dados de endereço inválidos.'});
    return;
  }

  db.transaction(() => {
    if (isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.auth!.userId);
    }
    db.prepare(`
      UPDATE addresses
      SET label = ?, cep = ?, street = ?, number = ?, complement = ?, neighborhood = ?, city = ?, state = ?, is_default = ?
      WHERE id = ? AND user_id = ?
    `).run(label, formatCep(cepDigits), street, number, complement, neighborhood, city, state, isDefault ? 1 : 0, addressId, req.auth!.userId);
  })();

  const addresses = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(req.auth!.userId);
  res.json({addresses});
});

app.delete('/api/account/addresses/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const addressId = Number(req.params.id);
  const countRow = db
    .prepare('SELECT COUNT(*) AS count FROM addresses WHERE user_id = ?')
    .get(req.auth!.userId) as {count: number};
  if (countRow.count <= 1) {
    res.status(400).json({error: 'Você precisa manter pelo menos um endereço cadastrado.'});
    return;
  }

  db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(addressId, req.auth!.userId);
  const addresses = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(req.auth!.userId);
  res.json({addresses});
});

app.get('/api/account/orders', requireAuth, (req: AuthedRequest, res: Response) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.auth!.userId) as Record<string, unknown>[];

  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const payStmt = db.prepare('SELECT id, gateway, method, status, amount_cents, pix_qr_code, pix_copy_paste, boleto_barcode, card_last4, card_brand, checkout_url, created_at FROM payments WHERE order_id = ?');
  const shipStmt = db.prepare('SELECT * FROM shipments WHERE order_id = ?');

  const enriched = orders.map((order) => ({
    ...order,
    shipping_address: JSON.parse(String(order.shipping_address_json || '{}')),
    items: itemsStmt.all(order.id),
    payment: payStmt.get(order.id),
    shipment: shipStmt.get(order.id),
  }));

  res.json({orders: enriched});
});

app.post('/api/account/orders/:id/cancel', requireAuth, (req: AuthedRequest, res: Response) => {
  const orderId = Number(req.params.id);
  const reason = sanitizeText(req.body?.reason || 'Cancelado pelo cliente', 200);

  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.auth!.userId) as {id: number; status: string; order_number: string} | undefined;

  if (!order) {
    res.status(404).json({error: 'Pedido não encontrado.'});
    return;
  }

  if (!['aguardando_pagamento', 'pago', 'em_separacao'].includes(order.status)) {
    res.status(400).json({error: 'Pedidos já enviados ou entregues não podem ser cancelados diretamente. Entre em contato pelo suporte.'});
    return;
  }

  const tx = db.transaction(() => {
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id) as {
      product_id: number;
      quantity: number;
    }[];
    const restoreStock = db.prepare(
      "UPDATE products SET stock = stock + ?, sales_count = MAX(0, sales_count - ?), updated_at = datetime('now') WHERE id = ?"
    );
    for (const item of items) {
      restoreStock.run(item.quantity, item.quantity, item.product_id);
    }
    db.prepare(
      "UPDATE orders SET status = 'cancelado', payment_status = 'cancelled', cancel_reason = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(reason, order.id);
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE order_id = ?").run(order.id);
    db.prepare("UPDATE shipments SET status = 'cancelado', updated_at = datetime('now') WHERE order_id = ?").run(order.id);
  });

  tx();
  broadcastEvent('catalog_updated', {reason: 'order_cancelled'});
  broadcastEvent('order_updated', {orderId: order.id, status: 'cancelado'});

  res.json({message: `Pedido ${order.order_number} cancelado e estoque restaurado.`});
});

app.delete('/api/account', requireAuth, (req: AuthedRequest, res: Response) => {
  const userId = req.auth!.userId;
  if (req.auth!.role !== 'customer') {
    res.status(403).json({error: 'Contas administrativas não podem ser encerradas por esta rota.'});
    return;
  }

  const ordersCount = db
    .prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?')
    .get(userId) as {count: number};

  if (ordersCount.count > 0) {
    // LGPD: anonymize personal data while preserving fiscal order ledger
    const anonymizedEmail = `encerrada_${userId}_${Date.now()}@anonimizado.lgpd`;
    db.transaction(() => {
      db.prepare(
        "UPDATE users SET full_name = 'Conta Encerrada (LGPD)', cpf = NULL, email = ?, phone = '', active = 0, updated_at = datetime('now') WHERE id = ?"
      ).run(anonymizedEmail, userId);
      db.prepare('DELETE FROM addresses WHERE user_id = ?').run(userId);
    })();
  } else {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  res.json({message: 'Sua conta foi encerrada e seus dados pessoais foram removidos conforme a LGPD.'});
});

// Checkout & Payment Processing
app.post('/api/checkout', requireAuth, async (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const shippingAddress = b.address || {};
  const shippingMethodId = b.shippingMethod === 'sedex' ? 'sedex' : b.shippingMethod === 'local' ? 'local' : 'pac';
  const paymentMethod = b.paymentMethod as 'pix' | 'credit_card' | 'boleto';
  const settings = getStoreSettings();

  if (items.length === 0) {
    res.status(400).json({error: 'Seu carrinho está vazio.'});
    return;
  }
  if (!['pix', 'credit_card', 'boleto'].includes(paymentMethod)) {
    res.status(400).json({error: 'Forma de pagamento inválida.'});
    return;
  }
  if (
    (paymentMethod === 'pix' && !settings.enable_pix) ||
    (paymentMethod === 'credit_card' && !settings.enable_credit_card) ||
    (paymentMethod === 'boleto' && !settings.enable_boleto)
  ) {
    res.status(400).json({error: 'Esta forma de pagamento está desativada no momento pela loja.'});
    return;
  }

  const cepDigits = onlyDigits(String(shippingAddress.cep || ''));
  const street = sanitizeText(shippingAddress.street, 150);
  const number = sanitizeText(shippingAddress.number, 20);
  const complement = sanitizeText(shippingAddress.complement, 100);
  const neighborhood = sanitizeText(shippingAddress.neighborhood, 100);
  const city = sanitizeText(shippingAddress.city, 100);
  const state = sanitizeText(shippingAddress.state, 2).toUpperCase();

  if (!isValidCep(cepDigits) || !street || !number || !neighborhood || !city || !BRAZILIAN_UFS.has(state)) {
    res.status(400).json({error: 'Endereço de entrega incompleto. Verifique antes de finalizar.'});
    return;
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || '';
  const safeExternalLink = isSafeExternalHttpUrl(settings.external_payment_link);

  let cardLast4 = '';
  let cardBrand = '';
  if (paymentMethod === 'credit_card') {
    const rawCardDigits = onlyDigits(String(b.cardTokenLast4 || b.cardNumber || ''));
    if (rawCardDigits.length >= 4) {
      cardLast4 = rawCardDigits.slice(-4);
      cardBrand = sanitizeText(b.cardBrand || 'Cartão', 30);
    }
    // Notice: full card number & CVV are NEVER persisted to the database
  }

  let createdOrder: Record<string, unknown> | null = null;
  let orderNumber = '';
  let totalCents = 0;
  let shippingCents = 0;
  let lineItemsForGateway: {title: string; quantity: number; unitPriceCents: number}[] = [];

  try {
    const tx = db.transaction(() => {
      let subtotalCents = 0;
      const lineItems: {productId: number; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number}[] = [];

      const findProduct = db.prepare('SELECT id, name, price_cents, promo_price_cents, stock, active FROM products WHERE id = ?');
      const decrementStock = db.prepare(
        "UPDATE products SET stock = stock - ?, sales_count = sales_count + ?, updated_at = datetime('now') WHERE id = ? AND stock >= ?"
      );

      for (const reqItem of items) {
        const productId = Number(reqItem?.productId);
        const quantity = Math.max(1, Math.min(99, Math.round(Number(reqItem?.quantity) || 1)));
        const product = findProduct.get(productId) as {
          id: number;
          name: string;
          price_cents: number;
          promo_price_cents: number | null;
          stock: number;
          active: number;
        } | undefined;

        if (!product || !product.active) {
          throw new Error('Um dos produtos selecionados não está mais disponível.');
        }
        if (product.stock < quantity) {
          throw new Error(`Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`);
        }

        const unitPrice = product.promo_price_cents !== null && product.promo_price_cents < product.price_cents
          ? product.promo_price_cents
          : product.price_cents;

        const updated = decrementStock.run(quantity, quantity, product.id, quantity);
        if (updated.changes === 0) {
          throw new Error(`Estoque atualizado concorrentemente para "${product.name}".`);
        }

        const lineTotal = unitPrice * quantity;
        subtotalCents += lineTotal;
        lineItems.push({
          productId: product.id,
          name: product.name,
          unitPriceCents: unitPrice,
          quantity,
          lineTotalCents: lineTotal,
        });
      }

      const freight = calculateFreightByCep(cepDigits, subtotalCents, {
        freeShippingThresholdCents: settings.free_shipping_threshold_cents,
        shippingMode: settings.shipping_mode,
        fixedPacCents: settings.fixed_pac_cents,
        fixedSedexCents: settings.fixed_sedex_cents,
        shippingExtraDays: settings.shipping_extra_days,
      });

      let estimatedDays = freight.pacDays;
      let shippingLabel = freight.freeEligible ? 'Frete Grátis (PAC)' : 'Correios PAC';
      shippingCents = freight.pacCents;

      if (shippingMethodId === 'sedex') {
        shippingCents = freight.sedexCents;
        estimatedDays = freight.sedexDays;
        shippingLabel = 'Correios SEDEX Expresso';
      } else if (shippingMethodId === 'local' && settings.local_delivery_enabled) {
        shippingCents = Math.max(0, settings.local_delivery_price_cents);
        estimatedDays = Math.max(1, settings.local_delivery_days);
        shippingLabel = settings.local_delivery_label || 'Entrega Local / Retirada (Ji-Paraná, RO)';
      }

      const pixPct = Math.max(0, Math.min(30, settings.pix_discount_percent));
      const discountCents = paymentMethod === 'pix' && pixPct > 0 ? Math.round((subtotalCents * pixPct) / 100) : 0;
      totalCents = Math.max(100, subtotalCents + shippingCents - discountCents);

      orderNumber = `SB-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
      // Never auto-approve unpaid orders; real confirmation happens via Mercado Pago webhook or store admin
      const initialStatus = 'aguardando_pagamento';
      const initialPaymentStatus = 'pending';

      const cleanAddressJson = JSON.stringify({
        cep: formatCep(cepDigits),
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
      });

      const orderInfo = db
        .prepare(`
          INSERT INTO orders (
            order_number, user_id, status, subtotal_cents, shipping_cents, discount_cents, total_cents,
            shipping_method, shipping_cep, shipping_address_json, payment_method, payment_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          orderNumber,
          req.auth!.userId,
          initialStatus,
          subtotalCents,
          shippingCents,
          discountCents,
          totalCents,
          shippingLabel,
          formatCep(cepDigits),
          cleanAddressJson,
          paymentMethod,
          initialPaymentStatus
        );

      const orderId = Number(orderInfo.lastInsertRowid);

      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity, total_cents)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const li of lineItems) {
        insertOrderItem.run(orderId, li.productId, li.name, li.unitPriceCents, li.quantity, li.lineTotalCents);
      }

      lineItemsForGateway = lineItems.map((li) => ({
        title: li.name,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
      }));

      const realEmvPix =
        paymentMethod === 'pix' && settings.pix_key.trim()
          ? generatePixPayload({
              pixKey: settings.pix_key,
              pixKeyType: settings.pix_key_type as PixKeyType,
              merchantName: settings.pix_merchant_name,
              merchantCity: settings.pix_merchant_city,
              amountCents: totalCents,
              txId: orderNumber,
            })
          : '';

      const pixCopyPaste =
        paymentMethod === 'pix'
          ? realEmvPix ||
            generatePixPayload({
              pixKey: settings.contact_email || 'suzybely@suzybely.com.br',
              pixKeyType: 'email',
              merchantName: settings.pix_merchant_name || 'SUZY BELY BIJUTERIAS',
              merchantCity: settings.pix_merchant_city || 'JI-PARANA',
              amountCents: totalCents,
              txId: orderNumber,
            })
          : '';

      const boletoBarcode =
        paymentMethod === 'boleto'
          ? `23793.38128 60000.000003 00000.000408 1 ${String(10000000000 + totalCents).slice(-11)}`
          : '';

      const initialCheckoutUrl = paymentMethod !== 'pix' && safeExternalLink ? safeExternalLink : '';

      db.prepare(`
        INSERT INTO payments (
          order_id, gateway, method, external_id, status, amount_cents,
          pix_qr_code, pix_copy_paste, boleto_barcode, card_last4, card_brand, checkout_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        mpToken ? 'mercadopago' : settings.pix_key.trim() ? 'pix_direto' : 'loja_manual',
        paymentMethod,
        `SB-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        initialPaymentStatus,
        totalCents,
        pixCopyPaste ? `QR-${orderNumber}` : '',
        pixCopyPaste,
        boletoBarcode,
        cardLast4,
        cardBrand,
        initialCheckoutUrl
      );

      db.prepare(`
        INSERT INTO shipments (order_id, carrier, service, cost_cents, estimated_days, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        shippingMethodId === 'local' ? 'Loja Suzy Bely' : 'Correios',
        shippingMethodId.toUpperCase(),
        shippingCents,
        estimatedDays,
        'aguardando_pagamento'
      );

      createdOrder = {
        id: orderId,
        orderNumber,
        status: initialStatus,
        subtotalCents,
        shippingCents,
        discountCents,
        totalCents,
        shippingLabel,
        estimatedDays,
        paymentMethod,
        paymentStatus: initialPaymentStatus,
        pixCopyPaste,
        boletoBarcode,
        cardLast4,
        cardBrand,
        checkoutUrl: initialCheckoutUrl,
        hasRealPixKey: Boolean(settings.pix_key.trim()),
        mercadoPagoConfigured: Boolean(mpToken),
        whatsappNumber: settings.whatsapp_number,
        items: lineItems,
        emailSentTo: req.auth!.email,
      };
    });

    tx();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao processar pedido.';
    res.status(400).json({error: message});
    return;
  }

  const rawAppUrl = process.env.APP_URL?.trim() || '';
  const notificationUrl = rawAppUrl.startsWith('https://')
    ? `${rawAppUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`
    : undefined;

  // Live Mercado Pago PIX or Checkout Pro preference when MERCADOPAGO_ACCESS_TOKEN is set on the server
  if (mpToken && createdOrder) {
    if (paymentMethod === 'pix') {
      try {
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mpToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': orderNumber,
          },
          body: JSON.stringify({
            transaction_amount: Number((totalCents / 100).toFixed(2)),
            description: `Pedido ${orderNumber} - Suzy Bely Bijuterias`,
            payment_method_id: 'pix',
            external_reference: orderNumber,
            ...(notificationUrl ? {notification_url: notificationUrl} : {}),
            payer: {email: req.auth!.email},
          }),
        });
        if (mpRes.ok) {
          const mpData = (await mpRes.json()) as {
            id?: number | string;
            point_of_interaction?: {transaction_data?: {qr_code?: string; ticket_url?: string}};
          };
          const liveQr = mpData.point_of_interaction?.transaction_data?.qr_code;
          const ticketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url || '';
          if (liveQr) {
            (createdOrder as Record<string, unknown>).pixCopyPaste = liveQr;
            (createdOrder as Record<string, unknown>).hasRealPixKey = true;
            if (ticketUrl) {
              (createdOrder as Record<string, unknown>).checkoutUrl = ticketUrl;
            }
            db.prepare('UPDATE payments SET external_id = ?, pix_copy_paste = ?, checkout_url = ? WHERE order_id = ?').run(
              String(mpData.id || ''),
              liveQr,
              ticketUrl,
              (createdOrder as {id: number}).id
            );
          }
        }
      } catch {
        // Keep generated PIX code gracefully
      }
    } else if (paymentMethod === 'credit_card' || paymentMethod === 'boleto') {
      try {
        const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mpToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            external_reference: orderNumber,
            items: lineItemsForGateway.map((li) => ({
              title: li.title,
              quantity: li.quantity,
              unit_price: Number((li.unitPriceCents / 100).toFixed(2)),
              currency_id: 'BRL',
            })),
            shipments: {
              cost: Number((shippingCents / 100).toFixed(2)),
              mode: 'not_specified',
            },
            payment_methods: {
              installments: Math.max(1, Math.min(12, settings.max_installments)),
            },
            ...(notificationUrl ? {notification_url: notificationUrl} : {}),
            payer: {email: req.auth!.email},
          }),
        });
        if (prefRes.ok) {
          const prefData = (await prefRes.json()) as {id?: string; init_point?: string};
          if (prefData.init_point) {
            (createdOrder as Record<string, unknown>).checkoutUrl = prefData.init_point;
            db.prepare('UPDATE payments SET external_id = ?, checkout_url = ? WHERE order_id = ?').run(
              String(prefData.id || ''),
              prefData.init_point,
              (createdOrder as {id: number}).id
            );
          }
        }
      } catch {
        // Keep fallback external payment link if configured
      }
    }
  }

  broadcastEvent('catalog_updated', {reason: 'order_created'});
  broadcastEvent('order_updated', {orderNumber});

  let emailDispatched = false;
  if (createdOrder) {
    const customerRow = db
      .prepare('SELECT full_name, email FROM users WHERE id = ?')
      .get(req.auth!.userId) as {full_name: string; email: string} | undefined;
    const customerName = customerRow?.full_name || 'Cliente';
    const customerEmail = customerRow?.email || req.auth!.email;
    const orderObj = createdOrder as {
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
      emailDispatched?: boolean;
    };

    const customerEmailRes = await sendOrderConfirmationEmail({
      to: customerEmail,
      customerName,
      order: orderObj,
    });
    emailDispatched = customerEmailRes.dispatched;
    orderObj.emailDispatched = emailDispatched;

    await sendOwnerNewOrderAlertEmail({
      customerName,
      customerEmail,
      order: {
        orderNumber: orderObj.orderNumber,
        totalCents: orderObj.totalCents,
        paymentMethod: orderObj.paymentMethod,
        shippingLabel: orderObj.shippingLabel,
        itemsCount: orderObj.items.reduce((acc, item) => acc + item.quantity, 0),
      },
    });
  }

  res.status(201).json({order: createdOrder});
});

app.post('/api/orders/:id/confirm-pix', requireAuth, async (req: AuthedRequest, res: Response) => {
  const orderId = Number(req.params.id);
  const order = db
    .prepare('SELECT id, user_id, order_number, payment_method, status FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, req.auth!.userId) as
    | {id: number; user_id: number; order_number: string; payment_method: string; status: string}
    | undefined;

  if (!order) {
    res.status(404).json({error: 'Pedido não encontrado.'});
    return;
  }
  if (order.status !== 'aguardando_pagamento') {
    res.status(400).json({error: 'Este pedido não está aguardando pagamento.'});
    return;
  }

  const payment = db
    .prepare('SELECT external_id, gateway FROM payments WHERE order_id = ?')
    .get(order.id) as {external_id: string; gateway: string} | undefined;
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

  // If linked to a real Mercado Pago payment ID, query Mercado Pago directly
  if (mpToken && payment?.gateway === 'mercadopago' && /^\d+$/.test(payment.external_id)) {
    try {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${payment.external_id}`, {
        headers: {Authorization: `Bearer ${mpToken}`},
      });
      if (mpRes.ok) {
        const mpData = (await mpRes.json()) as {status?: string};
        if (mpData.status === 'approved') {
          db.transaction(() => {
            db.prepare("UPDATE orders SET status = 'pago', payment_status = 'approved', updated_at = datetime('now') WHERE id = ?").run(order.id);
            db.prepare("UPDATE payments SET status = 'approved' WHERE order_id = ?").run(order.id);
            db.prepare("UPDATE shipments SET status = 'em_separacao', updated_at = datetime('now') WHERE order_id = ?").run(order.id);
          })();
          broadcastEvent('order_updated', {orderId: order.id, status: 'pago'});
          const customer = db
            .prepare('SELECT email, full_name FROM users WHERE id = ?')
            .get(order.user_id) as {email: string; full_name: string} | undefined;
          if (customer) {
            void sendOrderStatusEmail({
              to: customer.email,
              customerName: customer.full_name,
              orderNumber: order.order_number,
              status: 'pago',
            });
          }
          res.json({confirmedByGateway: true, message: 'Pagamento aprovado pelo Mercado Pago! Seu pedido entrou em separação.'});
          return;
        }
      }
    } catch {
      // Fall through to awaiting verification response
    }
  }

  // Otherwise notify store owner to verify receipt and approve in Admin Panel
  broadcastEvent('order_updated', {orderId: order.id, status: 'aguardando_pagamento', customerNotifiedPayment: true});
  res.json({
    confirmedByGateway: false,
    message: `Aviso de pagamento enviado para a loja! Assim que a equipe Suzy Bely conferir o recebimento do pedido ${order.order_number}, o status será atualizado para Pago.`,
  });
});

// ================= ADMIN & STAFF ROUTES =================

app.get('/api/admin/status', (_req: Request, res: Response) => {
  const adminCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1")
    .get() as {count: number};
  const hasEnvPasscode = Boolean(process.env.ADMIN_ACCESS_PASSCODE?.trim());

  res.json({
    needsBootstrap: adminCountRow.count === 0 && !hasEnvPasscode,
    hasEnvPasscode,
  });
});

app.post('/api/admin/bootstrap', (req: Request, res: Response) => {
  const hasEnvPasscode = Boolean(process.env.ADMIN_ACCESS_PASSCODE?.trim());
  if (hasEnvPasscode) {
    res.status(403).json({error: 'Acesso administrativo gerenciado por variável de ambiente.'});
    return;
  }

  const adminCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1")
    .get() as {count: number};
  if (adminCountRow.count > 0) {
    res.status(403).json({error: 'O administrador principal da loja já foi configurado.'});
    return;
  }

  const fullName = sanitizeText(req.body?.fullName || 'Suzy Bely Proprietária', 120);
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  const password = String(req.body?.password || '');

  if (!isValidEmail(email) || password.length < 6) {
    res.status(400).json({error: 'Informe um e-mail válido e senha com no mínimo 6 caracteres.'});
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({error: 'Este e-mail já pertence a outro cadastro.'});
    return;
  }

  const allPerms = ['manage_products', 'manage_orders', 'manage_customers', 'view_reports', 'manage_banners', 'manage_staff', 'manage_settings'];
  const passwordHash = hashPassword(password);

  const info = db
    .prepare(`
      INSERT INTO users (role, permissions_json, full_name, email, phone, password_hash, lgpd_consent, lgpd_consent_at, email_verified, account_verified, active)
      VALUES ('admin', ?, ?, ?, '', ?, 1, datetime('now'), 1, 1, 1)
    `)
    .run(JSON.stringify(allPerms), fullName, email, passwordHash);

  const userId = Number(info.lastInsertRowid);
  logAudit(userId, email, 'BOOTSTRAP_ADMIN', 'user', userId, 'Conta de proprietária configurada no primeiro acesso.');

  const token = signSessionToken({
    userId,
    role: 'admin',
    email,
    permissions: allPerms,
  });

  res.status(201).json({
    token,
    user: {
      id: userId,
      role: 'admin',
      fullName,
      email,
      permissions: allPerms,
    },
  });
});

app.post('/api/admin/login', (req: Request, res: Response) => {
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  const password = String(req.body?.password || '');
  const envPasscode = process.env.ADMIN_ACCESS_PASSCODE?.trim();

  if (envPasscode && password === envPasscode) {
    // Ensure a backed admin record exists for audit logs
    let adminUser = db
      .prepare("SELECT id, email, full_name, permissions_json FROM users WHERE role = 'admin' AND active = 1 LIMIT 1")
      .get() as {id: number; email: string; full_name: string; permissions_json: string} | undefined;

    const allPerms = ['manage_products', 'manage_orders', 'manage_customers', 'view_reports', 'manage_banners', 'manage_staff', 'manage_settings'];
    if (!adminUser) {
      const adminEmail = email && isValidEmail(email) ? email : 'admin@suzybely.com.br';
      const info = db
        .prepare(`
          INSERT INTO users (role, permissions_json, full_name, email, password_hash, lgpd_consent, lgpd_consent_at, email_verified, account_verified, active)
          VALUES ('admin', ?, 'Administração Suzy Bely', ?, ?, 1, datetime('now'), 1, 1, 1)
        `)
        .run(JSON.stringify(allPerms), adminEmail, hashPassword(crypto.randomBytes(16).toString('hex')));
      adminUser = {
        id: Number(info.lastInsertRowid),
        email: adminEmail,
        full_name: 'Administração Suzy Bely',
        permissions_json: JSON.stringify(allPerms),
      };
    }

    const token = signSessionToken({
      userId: adminUser.id,
      role: 'admin',
      email: adminUser.email,
      permissions: allPerms,
    });
    res.json({
      token,
      user: {
        id: adminUser.id,
        role: 'admin',
        fullName: adminUser.full_name,
        email: adminUser.email,
        permissions: allPerms,
      },
    });
    return;
  }

  if (!isValidEmail(email) || !password) {
    res.status(400).json({error: 'Informe e-mail e senha administrativos.'});
    return;
  }

  const user = db
    .prepare("SELECT * FROM users WHERE email = ? AND role IN ('admin', 'staff') AND active = 1")
    .get(email) as {
      id: number;
      role: 'admin' | 'staff';
      permissions_json: string;
      full_name: string;
      email: string;
      password_hash: string;
    } | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({error: 'Credenciais administrativas inválidas.'});
    return;
  }

  const permissions = JSON.parse(user.permissions_json || '[]') as string[];
  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    permissions,
  });

  res.json({
    token,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      permissions,
    },
  });
});

app.get('/api/admin/dashboard', requireAdminPermission(), (_req: AuthedRequest, res: Response) => {
  const salesSummary = db
    .prepare(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(CASE WHEN status != 'cancelado' THEN total_cents ELSE 0 END), 0) AS revenue_cents,
        COALESCE(SUM(CASE WHEN status = 'aguardando_pagamento' THEN 1 ELSE 0 END), 0) AS pending_orders,
        COALESCE(SUM(CASE WHEN status IN ('pago', 'em_separacao') THEN 1 ELSE 0 END), 0) AS processing_orders,
        COALESCE(SUM(CASE WHEN status IN ('enviado', 'entregue') THEN 1 ELSE 0 END), 0) AS fulfilled_orders
      FROM orders
    `)
    .get();

  const inventorySummary = db
    .prepare(`
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(stock), 0) AS total_units,
        COALESCE(SUM(CASE WHEN stock <= 5 THEN 1 ELSE 0 END), 0) AS low_stock_count,
        COALESCE(SUM(CASE WHEN promo_price_cents IS NOT NULL AND promo_price_cents < price_cents THEN 1 ELSE 0 END), 0) AS promo_count
      FROM products
      WHERE active = 1
    `)
    .get();

  const customerCount = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'customer' AND active = 1")
    .get() as {count: number};

  const categoryBreakdown = db
    .prepare(`
      SELECT
        c.name AS category_name,
        COUNT(p.id) AS product_count,
        COALESCE(SUM(p.stock), 0) AS stock_units,
        COALESCE(SUM(oi.total_cents), 0) AS sales_cents
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
      LEFT JOIN order_items oi ON oi.product_id = p.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `)
    .all();

  const allProducts = enrichProducts(
    db
      .prepare(`
        SELECT p.*, c.name AS category_name, c.slug AS category_slug,
               sc.name AS subcategory_name, sc.slug AS subcategory_slug
        FROM products p
        JOIN categories c ON c.id = p.category_id
        LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
        ORDER BY p.active DESC, p.id DESC
      `)
      .all() as Record<string, unknown>[]
  );

  const categories = getCategoriesWithSubcategories(false);

  const auditLogs = db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 30')
    .all();

  res.json({
    salesSummary,
    inventorySummary,
    customerCount: customerCount.count,
    categoryBreakdown,
    products: allProducts,
    categories,
    auditLogs,
  });
});

// Upload a single category cover image
app.post(
  '/api/admin/uploads/category-image',
  requireAdminPermission('manage_products'),
  (req: AuthedRequest, res: Response) => {
    productImageUpload.single('image')(req, res, (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({error: uploadErr instanceof Error ? uploadErr.message : 'Erro no envio da imagem.'});
        return;
      }
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({error: 'Selecione uma imagem válida (JPG, PNG, WEBP ou GIF).'});
        return;
      }
      const ext = detectImageExtension(file.buffer);
      if (!ext) {
        res.status(400).json({error: 'O ficheiro enviado não é uma imagem válida.'});
        return;
      }
      const filename = `cat-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const dest = path.resolve(uploadsCategoriesDir, filename);
      if (!dest.startsWith(uploadsCategoriesDir + path.sep)) {
        res.status(400).json({error: 'Caminho de ficheiro inválido.'});
        return;
      }
      fs.writeFileSync(dest, file.buffer);
      res.status(201).json({imageUrl: `/uploads/categories/${filename}`});
    });
  }
);

// Upload multiple physical product images at once
app.post(
  '/api/admin/uploads/product-images',
  requireAdminPermission('manage_products'),
  (req: AuthedRequest, res: Response) => {
    productImageUpload.array('images', 12)(req, res, (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({error: uploadErr instanceof Error ? uploadErr.message : 'Erro no envio das imagens.'});
        return;
      }
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({error: 'Selecione pelo menos uma fotografia válida (JPG, PNG, WEBP ou GIF).'});
        return;
      }

      const savedFiles: {imagem: string; originalName: string}[] = [];
      for (const file of files) {
        const ext = detectImageExtension(file.buffer);
        if (!ext) {
          // Rollback already saved files from this batch if invalid binary detected
          for (const f of savedFiles) {
            deletePhysicalProductImageIfUnused(f.imagem);
          }
          res.status(400).json({error: `O ficheiro "${sanitizeText(file.originalname, 80)}" não é uma imagem válida.`});
          return;
        }
        const filename = `prod-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        const dest = path.resolve(uploadsProductsDir, filename);
        if (!dest.startsWith(uploadsProductsDir + path.sep)) {
          res.status(400).json({error: 'Caminho de ficheiro inválido.'});
          return;
        }
        fs.writeFileSync(dest, file.buffer);
        savedFiles.push({
          imagem: `/uploads/products/${filename}`,
          originalName: sanitizeText(file.originalname, 80),
        });
      }

      res.status(201).json({files: savedFiles});
    });
  }
);

function parseProductImagesPayload(body: Record<string, unknown>, fallbackName: string) {
  if (Array.isArray(body.images)) {
    const valid = body.images
      .map((item, idx) => {
        const obj = (item || {}) as Record<string, unknown>;
        const rawPath = typeof obj.imagem === 'string' ? obj.imagem : typeof obj.url === 'string' ? obj.url : '';
        if (!isSafeImageUrl(rawPath)) return null;
        return {
          id: Number(obj.id) || null,
          imagem: rawPath.trim(),
          alt: sanitizeText(obj.alt || fallbackName, 140),
          principal: Boolean(obj.principal),
          ordem: Number.isFinite(Number(obj.ordem)) ? Number(obj.ordem) : idx,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (valid.length > 0 && !valid.some((v) => v.principal)) {
      valid[0].principal = true;
    } else if (valid.filter((v) => v.principal).length > 1) {
      let seen = false;
      for (const v of valid) {
        if (v.principal) {
          if (seen) v.principal = false;
          else seen = true;
        }
      }
    }
    return valid;
  }

  const urls = (Array.isArray(body.imageUrls) ? body.imageUrls : [body.imageUrl])
    .filter((u: unknown) => isSafeImageUrl(u))
    .map((u: string) => u.trim());

  return urls.map((url, idx) => ({
    id: null as number | null,
    imagem: url,
    alt: fallbackName,
    principal: idx === 0,
    ordem: idx,
  }));
}

app.post('/api/admin/products', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const categoryId = Number(b.categoryId);
  const rawSubcategoryId = b.subcategoryId !== null && b.subcategoryId !== undefined && b.subcategoryId !== ''
    ? Number(b.subcategoryId)
    : null;
  const name = sanitizeText(b.name, 140);
  const brand = sanitizeText(b.brand, 80);
  const sku = sanitizeText(b.sku, 50);
  const description = sanitizeText(b.description, 2000);
  const material = sanitizeText(b.material, 200);
  const color = sanitizeText(b.color, 80);
  const dimensions = sanitizeText(b.dimensions, 120);
  const attributes = parseAttributesJson(b.attributes);
  const priceCents = Math.round(Number(b.priceCents) || 0);
  const promoPriceCents = b.promoPriceCents !== null && b.promoPriceCents !== undefined && b.promoPriceCents !== ''
    ? Math.round(Number(b.promoPriceCents))
    : null;
  const stock = Math.max(0, Math.round(Number(b.stock) || 0));
  const isFeatured = b.isFeatured ? 1 : 0;
  const isNew = b.isNew ? 1 : 0;
  const isBestseller = b.isBestseller ? 1 : 0;
  const active = b.active === false ? 0 : 1;

  if (!categoryId || name.length < 2 || !description || priceCents <= 0) {
    res.status(400).json({error: 'Preencha categoria, nome, descrição e preço de venda válido.'});
    return;
  }
  const catRow = db.prepare('SELECT id, image_url FROM categories WHERE id = ?').get(categoryId) as
    | {id: number; image_url: string}
    | undefined;
  if (!catRow) {
    res.status(400).json({error: 'Categoria selecionada não encontrada.'});
    return;
  }
  let subcategoryId: number | null = null;
  if (rawSubcategoryId && Number.isInteger(rawSubcategoryId) && rawSubcategoryId > 0) {
    const subRow = db
      .prepare('SELECT id FROM subcategories WHERE id = ? AND category_id = ?')
      .get(rawSubcategoryId, categoryId) as {id: number} | undefined;
    if (!subRow) {
      res.status(400).json({error: 'Subcategoria selecionada não pertence à categoria escolhida.'});
      return;
    }
    subcategoryId = subRow.id;
  }
  if (promoPriceCents !== null && (promoPriceCents <= 0 || promoPriceCents >= priceCents)) {
    res.status(400).json({error: 'O preço promocional deve ser maior que zero e menor que o preço original.'});
    return;
  }

  const baseSlug = slugify(name) || `produto-${Date.now()}`;
  const slug = `${baseSlug}-${crypto.randomInt(100, 999)}`;

  const parsedImages = parseProductImagesPayload(b, name);
  const fallbackImage = isSafeImageUrl(catRow.image_url)
    ? catRow.image_url
    : '/src/assets/images/product_brincos_dourados_1795522216821.jpg';
  const finalImages =
    parsedImages.length > 0
      ? parsedImages
      : [
          {
            id: null,
            imagem: fallbackImage,
            alt: name,
            principal: true,
            ordem: 0,
          },
        ];

  let newId = 0;
  db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO products (
          category_id, subcategory_id, name, slug, brand, sku, description, material, color, dimensions,
          attributes_json, price_cents, promo_price_cents, stock, is_featured, is_new, is_bestseller, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        categoryId,
        subcategoryId,
        name,
        slug,
        brand,
        sku,
        description,
        material,
        color,
        dimensions,
        JSON.stringify(attributes),
        priceCents,
        promoPriceCents,
        stock,
        isFeatured,
        isNew,
        isBestseller,
        active
      );
    newId = Number(info.lastInsertRowid);
    const insImg = db.prepare(
      'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem) VALUES (?, ?, ?, ?, ?)'
    );
    finalImages.forEach((img, idx) =>
      insImg.run(newId, img.imagem, img.alt || name, img.principal ? 1 : 0, idx)
    );
    logAudit(req.auth!.userId, req.auth!.email, 'CREATE_PRODUCT', 'product', newId, `Produto cadastrado: ${name}`);
  })();

  broadcastEvent('catalog_updated', {reason: 'product_created', productId: newId});
  res.status(201).json({
    id: newId,
    images: getProductImages(newId),
    message: 'Produto cadastrado e publicado em tempo real!',
  });
});

app.put('/api/admin/products/:id', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name FROM products WHERE id = ?').get(id) as {id: number; name: string} | undefined;
  if (!existing) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }

  const b = (req.body || {}) as Record<string, unknown>;
  const categoryId = Number(b.categoryId);
  const rawSubcategoryId = b.subcategoryId !== null && b.subcategoryId !== undefined && b.subcategoryId !== ''
    ? Number(b.subcategoryId)
    : null;
  const name = sanitizeText(b.name, 140);
  const brand = sanitizeText(b.brand, 80);
  const sku = sanitizeText(b.sku, 50);
  const description = sanitizeText(b.description, 2000);
  const material = sanitizeText(b.material, 200);
  const color = sanitizeText(b.color, 80);
  const dimensions = sanitizeText(b.dimensions, 120);
  const attributes = parseAttributesJson(b.attributes);
  const priceCents = Math.round(Number(b.priceCents) || 0);
  const promoPriceCents = b.promoPriceCents !== null && b.promoPriceCents !== undefined && b.promoPriceCents !== ''
    ? Math.round(Number(b.promoPriceCents))
    : null;
  const stock = Math.max(0, Math.round(Number(b.stock) || 0));
  const isFeatured = b.isFeatured ? 1 : 0;
  const isNew = b.isNew ? 1 : 0;
  const isBestseller = b.isBestseller ? 1 : 0;
  const active = b.active === false ? 0 : 1;

  if (!categoryId || name.length < 2 || !description || priceCents <= 0) {
    res.status(400).json({error: 'Preencha categoria, nome, descrição e preço de venda válido.'});
    return;
  }
  const catRow = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId) as {id: number} | undefined;
  if (!catRow) {
    res.status(400).json({error: 'Categoria selecionada não encontrada.'});
    return;
  }
  let subcategoryId: number | null = null;
  if (rawSubcategoryId && Number.isInteger(rawSubcategoryId) && rawSubcategoryId > 0) {
    const subRow = db
      .prepare('SELECT id FROM subcategories WHERE id = ? AND category_id = ?')
      .get(rawSubcategoryId, categoryId) as {id: number} | undefined;
    if (!subRow) {
      res.status(400).json({error: 'Subcategoria selecionada não pertence à categoria escolhida.'});
      return;
    }
    subcategoryId = subRow.id;
  }
  if (promoPriceCents !== null && (promoPriceCents <= 0 || promoPriceCents >= priceCents)) {
    res.status(400).json({error: 'O preço promocional deve ser maior que zero e menor que o preço original.'});
    return;
  }

  const hasExplicitImagesPayload = Array.isArray(b.images) || Array.isArray(b.imageUrls) || typeof b.imageUrl === 'string';
  const parsedImages = hasExplicitImagesPayload ? parseProductImagesPayload(b, name) : [];
  let removedPaths: string[] = [];

  db.transaction(() => {
    db.prepare(`
      UPDATE products SET
        category_id = ?, subcategory_id = ?, name = ?, brand = ?, sku = ?, description = ?,
        material = ?, color = ?, dimensions = ?, attributes_json = ?,
        price_cents = ?, promo_price_cents = ?, stock = ?, is_featured = ?, is_new = ?,
        is_bestseller = ?, active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      categoryId,
      subcategoryId,
      name,
      brand,
      sku,
      description,
      material,
      color,
      dimensions,
      JSON.stringify(attributes),
      priceCents,
      promoPriceCents,
      stock,
      isFeatured,
      isNew,
      isBestseller,
      active,
      id
    );

    if (hasExplicitImagesPayload) {
      const prevRows = db
        .prepare('SELECT id, imagem FROM produto_imagens WHERE produto_id = ?')
        .all(id) as {id: number; imagem: string}[];
      const nextPaths = new Set(parsedImages.map((p) => p.imagem));
      removedPaths = prevRows.map((r) => r.imagem).filter((p) => !nextPaths.has(p));

      db.prepare('DELETE FROM produto_imagens WHERE produto_id = ?').run(id);
      const insImg = db.prepare(
        'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem) VALUES (?, ?, ?, ?, ?)'
      );
      parsedImages.forEach((img, idx) =>
        insImg.run(id, img.imagem, img.alt || name, img.principal ? 1 : 0, idx)
      );
    }

    logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_PRODUCT', 'product', id, `Atualizado: ${name}`);
  })();

  for (const oldPath of removedPaths) {
    deletePhysicalProductImageIfUnused(oldPath);
  }

  broadcastEvent('catalog_updated', {reason: 'product_updated', productId: id});
  res.json({images: getProductImages(id), message: 'Produto atualizado em tempo real!'});
});

// Dedicated Product Photo Gallery Management Routes (produto_imagens) — without recreating product
app.get('/api/admin/products/:id/images', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(id) as {id: number; name: string} | undefined;
  if (!product) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }
  res.json({images: getProductImages(id)});
});

app.post('/api/admin/products/:id/images', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId) as {id: number; name: string} | undefined;
  if (!product) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }

  productImageUpload.array('images', 12)(req, res, (uploadErr) => {
    if (uploadErr) {
      res.status(400).json({error: uploadErr instanceof Error ? uploadErr.message : 'Erro no envio das fotografias.'});
      return;
    }
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({error: 'Selecione ao menos uma fotografia válida (JPG, PNG, WEBP ou GIF).'});
      return;
    }

    const savedPaths: string[] = [];
    for (const file of files) {
      const ext = detectImageExtension(file.buffer);
      if (!ext) {
        for (const p of savedPaths) deletePhysicalProductImageIfUnused(p);
        res.status(400).json({error: `O ficheiro "${sanitizeText(file.originalname, 80)}" não é uma imagem válida.`});
        return;
      }
      const filename = `prod-${productId}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
      const dest = path.resolve(uploadsProductsDir, filename);
      if (!dest.startsWith(uploadsProductsDir + path.sep)) {
        res.status(400).json({error: 'Caminho de ficheiro inválido.'});
        return;
      }
      fs.writeFileSync(dest, file.buffer);
      savedPaths.push(`/uploads/products/${filename}`);
    }

    db.transaction(() => {
      const hasPrincipal = Boolean(
        db.prepare('SELECT 1 FROM produto_imagens WHERE produto_id = ? AND principal = 1 LIMIT 1').get(productId)
      );
      const maxOrder = (
        db.prepare('SELECT COALESCE(MAX(ordem), -1) AS max_ordem FROM produto_imagens WHERE produto_id = ?').get(productId) as {
          max_ordem: number;
        }
      ).max_ordem;

      const ins = db.prepare(
        'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem) VALUES (?, ?, ?, ?, ?)'
      );
      savedPaths.forEach((imgPath, idx) => {
        const isPrincipal = !hasPrincipal && idx === 0 ? 1 : 0;
        ins.run(productId, imgPath, product.name, isPrincipal, maxOrder + 1 + idx);
      });
      logAudit(
        req.auth!.userId,
        req.auth!.email,
        'ADD_PRODUCT_IMAGES',
        'product',
        productId,
        `${savedPaths.length} fotografia(s) adicionada(s) a ${product.name}`
      );
    })();

    broadcastEvent('catalog_updated', {reason: 'product_images_updated', productId});
    res.status(201).json({images: getProductImages(productId), message: `${savedPaths.length} fotografia(s) adicionada(s)!`});
  });
});

app.put('/api/admin/products/:id/images', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId) as {id: number; name: string} | undefined;
  if (!product) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }

  const parsedImages = parseProductImagesPayload((req.body || {}) as Record<string, unknown>, product.name);
  let removedPaths: string[] = [];

  db.transaction(() => {
    const prevRows = db
      .prepare('SELECT id, imagem, criado_em FROM produto_imagens WHERE produto_id = ?')
      .all(productId) as {id: number; imagem: string; criado_em: string}[];
    const prevMap = new Map(prevRows.map((r) => [r.id, r]));
    const nextPaths = new Set(parsedImages.map((p) => p.imagem));
    removedPaths = prevRows.map((r) => r.imagem).filter((p) => !nextPaths.has(p));

    db.prepare('DELETE FROM produto_imagens WHERE produto_id = ?').run(productId);
    const ins = db.prepare(
      'INSERT INTO produto_imagens (produto_id, imagem, alt, principal, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
    );
    parsedImages.forEach((img, idx) => {
      const prev = img.id ? prevMap.get(img.id) : undefined;
      ins.run(
        productId,
        img.imagem,
        img.alt || product.name,
        img.principal ? 1 : 0,
        idx,
        prev?.criado_em || new Date().toISOString().replace('T', ' ').slice(0, 19)
      );
    });
    logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_PRODUCT_IMAGES', 'product', productId, `Galeria atualizada: ${product.name}`);
  })();

  for (const oldPath of removedPaths) {
    deletePhysicalProductImageIfUnused(oldPath);
  }

  broadcastEvent('catalog_updated', {reason: 'product_images_updated', productId});
  res.json({images: getProductImages(productId), message: 'Galeria de fotografias atualizada em tempo real!'});
});

app.patch('/api/admin/products/:id/images/:imageId/principal', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const productId = Number(req.params.id);
  const imageId = Number(req.params.imageId);

  const imgRow = db
    .prepare('SELECT id FROM produto_imagens WHERE id = ? AND produto_id = ?')
    .get(imageId, productId);
  if (!imgRow) {
    res.status(404).json({error: 'Imagem não encontrada para este produto.'});
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE produto_imagens SET principal = 0 WHERE produto_id = ?').run(productId);
    db.prepare('UPDATE produto_imagens SET principal = 1 WHERE id = ? AND produto_id = ?').run(imageId, productId);
  })();

  broadcastEvent('catalog_updated', {reason: 'product_images_updated', productId});
  res.json({images: getProductImages(productId), message: 'Fotografia principal definida!'});
});

app.delete('/api/admin/products/:id/images/:imageId', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const productId = Number(req.params.id);
  const imageId = Number(req.params.imageId);

  const imgRow = db
    .prepare('SELECT id, imagem, principal FROM produto_imagens WHERE id = ? AND produto_id = ?')
    .get(imageId, productId) as {id: number; imagem: string; principal: number} | undefined;
  if (!imgRow) {
    res.status(404).json({error: 'Imagem não encontrada para este produto.'});
    return;
  }

  db.transaction(() => {
    db.prepare('DELETE FROM produto_imagens WHERE id = ? AND produto_id = ?').run(imageId, productId);
    if (imgRow.principal) {
      const nextImg = db
        .prepare('SELECT id FROM produto_imagens WHERE produto_id = ? ORDER BY ordem ASC, id ASC LIMIT 1')
        .get(productId) as {id: number} | undefined;
      if (nextImg) {
        db.prepare('UPDATE produto_imagens SET principal = 1 WHERE id = ?').run(nextImg.id);
      }
    }
    logAudit(req.auth!.userId, req.auth!.email, 'DELETE_PRODUCT_IMAGE', 'produto_imagens', imageId, `Imagem removida do produto #${productId}`);
  })();

  deletePhysicalProductImageIfUnused(imgRow.imagem);

  broadcastEvent('catalog_updated', {reason: 'product_images_updated', productId});
  res.json({images: getProductImages(productId), message: 'Fotografia removida com segurança!'});
});

app.patch('/api/admin/products/:id/quick-stock', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const product = db.prepare('SELECT id, name, price_cents, stock, active FROM products WHERE id = ?').get(id) as {
    id: number;
    name: string;
    price_cents: number;
    stock: number;
    active: number;
  } | undefined;
  if (!product) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }

  const priceCents = req.body?.priceCents !== undefined ? Math.max(100, Math.round(Number(req.body.priceCents))) : product.price_cents;
  const promoPriceCents = req.body?.promoPriceCents !== null && req.body?.promoPriceCents !== undefined && req.body?.promoPriceCents !== ''
    ? Math.round(Number(req.body.promoPriceCents))
    : null;
  const stock = req.body?.stock !== undefined ? Math.max(0, Math.round(Number(req.body.stock))) : product.stock;
  const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : product.active;

  if (promoPriceCents !== null && (promoPriceCents <= 0 || promoPriceCents >= priceCents)) {
    res.status(400).json({error: 'O preço promocional deve ser maior que zero e menor que o preço original.'});
    return;
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE products SET price_cents = ?, promo_price_cents = ?, stock = ?, active = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(priceCents, promoPriceCents, stock, active, id);
    logAudit(
      req.auth!.userId,
      req.auth!.email,
      'QUICK_INVENTORY_UPDATE',
      'product',
      id,
      `${product.name}: R$ ${(priceCents / 100).toFixed(2)}, promo=${promoPriceCents !== null ? `R$ ${(promoPriceCents / 100).toFixed(2)}` : 'sem promo'}, estoque=${stock}, ativo=${Boolean(active)}`
    );
  })();

  broadcastEvent('catalog_updated', {reason: 'quick_stock', productId: id});
  res.json({message: 'Produto atualizado em tempo real!'});
});

app.delete('/api/admin/products/:id', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const usedInOrders = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?').get(id) as {count: number};
  const product = db.prepare('SELECT name FROM products WHERE id = ?').get(id) as {name: string} | undefined;
  if (!product) {
    res.status(404).json({error: 'Produto não encontrado.'});
    return;
  }

  if (usedInOrders.count > 0) {
    // Archive instead of breaking order history FK
    db.prepare("UPDATE products SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    logAudit(req.auth!.userId, req.auth!.email, 'ARCHIVE_PRODUCT', 'product', id, `Arquivado (com histórico de pedidos): ${product.name}`);
  } else {
    const imgRows = db
      .prepare('SELECT imagem FROM produto_imagens WHERE produto_id = ?')
      .all(id) as {imagem: string}[];
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    for (const row of imgRows) {
      deletePhysicalProductImageIfUnused(row.imagem);
    }
    logAudit(req.auth!.userId, req.auth!.email, 'DELETE_PRODUCT', 'product', id, `Excluído: ${product.name}`);
  }

  broadcastEvent('catalog_updated', {reason: 'product_deleted', productId: id});
  res.json({message: 'Produto removido do catálogo ativo.'});
});

// Admin Categories & Subcategories (100% Dynamic)
app.post('/api/admin/categories', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const name = sanitizeText(req.body?.name, 60);
  const description = sanitizeText(req.body?.description, 240);
  const rawImage = req.body?.imageUrl;
  const imageUrl = isSafeImageUrl(rawImage)
    ? String(rawImage).trim()
    : '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg';
  const active = req.body?.active === false ? 0 : 1;

  if (name.length < 2) {
    res.status(400).json({error: 'Nome da categoria obrigatório.'});
    return;
  }
  const slug = slugify(name) || `categoria-${Date.now()}`;
  const exists = db.prepare('SELECT id FROM categories WHERE slug = ? OR LOWER(name) = LOWER(?)').get(slug, name);
  if (exists) {
    res.status(409).json({error: 'Já existe uma categoria com este nome.'});
    return;
  }
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get() as {m: number}).m;
  const info = db
    .prepare('INSERT INTO categories (name, slug, description, image_url, active, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, slug, description, imageUrl, active, maxOrder + 1);
  const newId = Number(info.lastInsertRowid);
  logAudit(req.auth!.userId, req.auth!.email, 'CREATE_CATEGORY', 'category', newId, name);
  broadcastEvent('catalog_updated', {reason: 'category_created', categoryId: newId});
  res.status(201).json({
    id: newId,
    name,
    slug,
    description,
    image_url: imageUrl,
    active: Boolean(active),
    sort_order: maxOrder + 1,
    subcategories: [],
    product_count: 0,
    message: 'Categoria criada com sucesso!',
  });
});

app.put('/api/admin/categories/:id', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, name, slug, description, image_url, active, sort_order FROM categories WHERE id = ?')
    .get(id) as
    | {id: number; name: string; slug: string; description: string; image_url: string; active: number; sort_order: number}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Categoria não encontrada.'});
    return;
  }

  const name = sanitizeText(req.body?.name, 60);
  const description = req.body?.description !== undefined ? sanitizeText(req.body.description, 240) : existing.description;
  const imageUrl =
    req.body?.imageUrl !== undefined
      ? isSafeImageUrl(req.body.imageUrl)
        ? String(req.body.imageUrl).trim()
        : existing.image_url
      : existing.image_url;
  const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
  const sortOrder =
    req.body?.sortOrder !== undefined && Number.isFinite(Number(req.body.sortOrder))
      ? Number(req.body.sortOrder)
      : existing.sort_order;

  if (name.length < 2) {
    res.status(400).json({error: 'Nome da categoria obrigatório.'});
    return;
  }

  const dupName = db
    .prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?')
    .get(name, id);
  if (dupName) {
    res.status(409).json({error: 'Já existe outra categoria com este nome.'});
    return;
  }

  let nextSlug = slugify(name) || existing.slug;
  const dupSlug = db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(nextSlug, id);
  if (dupSlug) nextSlug = `${nextSlug}-${id}`;

  const oldImageUrl = existing.image_url;
  db.prepare(
    'UPDATE categories SET name = ?, slug = ?, description = ?, image_url = ?, active = ?, sort_order = ? WHERE id = ?'
  ).run(name, nextSlug, description, imageUrl, active, sortOrder, id);

  if (oldImageUrl && oldImageUrl !== imageUrl) {
    deletePhysicalCategoryImageIfUnused(oldImageUrl);
  }

  logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_CATEGORY', 'category', id, name);
  broadcastEvent('catalog_updated', {reason: 'category_updated', categoryId: id});
  res.json({message: 'Categoria atualizada em tempo real!'});
});

app.patch('/api/admin/categories/:id/toggle', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name, active FROM categories WHERE id = ?').get(id) as
    | {id: number; name: string; active: number}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Categoria não encontrada.'});
    return;
  }
  const nextActive = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active ? 0 : 1;
  db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(nextActive, id);
  logAudit(
    req.auth!.userId,
    req.auth!.email,
    'TOGGLE_CATEGORY',
    'category',
    id,
    `${existing.name}: ${nextActive ? 'ativada' : 'desativada'}`
  );
  broadcastEvent('catalog_updated', {reason: 'category_toggled', categoryId: id});
  res.json({
    active: Boolean(nextActive),
    message: nextActive ? 'Categoria ativada na loja!' : 'Categoria desativada da vitrine.',
  });
});

app.delete('/api/admin/categories/:id', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name, image_url FROM categories WHERE id = ?').get(id) as
    | {id: number; name: string; image_url: string}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Categoria não encontrada.'});
    return;
  }
  const count = (db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ?').get(id) as {count: number}).count;
  if (count > 0) {
    res.status(400).json({error: 'Não é possível excluir categoria que possui produtos vinculados. Desative-a ou mova os produtos primeiro.'});
    return;
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  deletePhysicalCategoryImageIfUnused(existing.image_url);
  logAudit(req.auth!.userId, req.auth!.email, 'DELETE_CATEGORY', 'category', id, `Categoria removida: ${existing.name}`);
  broadcastEvent('catalog_updated', {reason: 'category_deleted', categoryId: id});
  res.json({message: 'Categoria excluída com sucesso.'});
});

// Admin Subcategories CRUD
app.post('/api/admin/categories/:id/subcategories', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const categoryId = Number(req.params.id);
  const cat = db.prepare('SELECT id, name, slug FROM categories WHERE id = ?').get(categoryId) as
    | {id: number; name: string; slug: string}
    | undefined;
  if (!cat) {
    res.status(404).json({error: 'Categoria principal não encontrada.'});
    return;
  }

  const name = sanitizeText(req.body?.name, 70);
  const description = sanitizeText(req.body?.description, 200);
  const active = req.body?.active === false ? 0 : 1;
  if (name.length < 2) {
    res.status(400).json({error: 'Nome da subcategoria obrigatório.'});
    return;
  }

  const dupInCat = db
    .prepare('SELECT id FROM subcategories WHERE category_id = ? AND LOWER(name) = LOWER(?)')
    .get(categoryId, name);
  if (dupInCat) {
    res.status(409).json({error: 'Já existe esta subcategoria nesta categoria.'});
    return;
  }

  let slug = slugify(name) || `sub-${Date.now()}`;
  const slugConflict = db.prepare('SELECT id FROM subcategories WHERE slug = ?').get(slug);
  if (slugConflict) {
    slug = slugify(`${cat.slug}-${name}`) || `${slug}-${categoryId}`;
  }
  const slugConflict2 = db.prepare('SELECT id FROM subcategories WHERE slug = ?').get(slug);
  if (slugConflict2) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM subcategories WHERE category_id = ?').get(categoryId) as {m: number}
  ).m;

  const info = db
    .prepare('INSERT INTO subcategories (category_id, name, slug, description, active, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(categoryId, name, slug, description, active, maxOrder + 1);
  const newId = Number(info.lastInsertRowid);

  logAudit(req.auth!.userId, req.auth!.email, 'CREATE_SUBCATEGORY', 'subcategory', newId, `${cat.name} > ${name}`);
  broadcastEvent('catalog_updated', {reason: 'subcategory_created', categoryId, subcategoryId: newId});
  res.status(201).json({
    id: newId,
    category_id: categoryId,
    name,
    slug,
    description,
    active: Boolean(active),
    sort_order: maxOrder + 1,
    product_count: 0,
    message: 'Subcategoria adicionada!',
  });
});

app.put('/api/admin/subcategories/:subId', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const subId = Number(req.params.subId);
  const existing = db
    .prepare('SELECT id, category_id, name, slug, description, active FROM subcategories WHERE id = ?')
    .get(subId) as
    | {id: number; category_id: number; name: string; slug: string; description: string; active: number}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Subcategoria não encontrada.'});
    return;
  }

  const name = sanitizeText(req.body?.name, 70);
  const description = req.body?.description !== undefined ? sanitizeText(req.body.description, 200) : existing.description;
  const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
  if (name.length < 2) {
    res.status(400).json({error: 'Nome da subcategoria obrigatório.'});
    return;
  }

  const dupInCat = db
    .prepare('SELECT id FROM subcategories WHERE category_id = ? AND LOWER(name) = LOWER(?) AND id != ?')
    .get(existing.category_id, name, subId);
  if (dupInCat) {
    res.status(409).json({error: 'Já existe outra subcategoria com este nome nesta categoria.'});
    return;
  }

  let nextSlug = slugify(name) || existing.slug;
  const dupSlug = db.prepare('SELECT id FROM subcategories WHERE slug = ? AND id != ?').get(nextSlug, subId);
  if (dupSlug) nextSlug = `${nextSlug}-${subId}`;

  db.prepare('UPDATE subcategories SET name = ?, slug = ?, description = ?, active = ? WHERE id = ?').run(
    name,
    nextSlug,
    description,
    active,
    subId
  );

  logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_SUBCATEGORY', 'subcategory', subId, name);
  broadcastEvent('catalog_updated', {reason: 'subcategory_updated', subcategoryId: subId});
  res.json({message: 'Subcategoria atualizada!'});
});

app.patch('/api/admin/subcategories/:subId/toggle', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const subId = Number(req.params.subId);
  const existing = db.prepare('SELECT id, name, active FROM subcategories WHERE id = ?').get(subId) as
    | {id: number; name: string; active: number}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Subcategoria não encontrada.'});
    return;
  }
  const nextActive = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active ? 0 : 1;
  db.prepare('UPDATE subcategories SET active = ? WHERE id = ?').run(nextActive, subId);
  logAudit(
    req.auth!.userId,
    req.auth!.email,
    'TOGGLE_SUBCATEGORY',
    'subcategory',
    subId,
    `${existing.name}: ${nextActive ? 'ativada' : 'desativada'}`
  );
  broadcastEvent('catalog_updated', {reason: 'subcategory_toggled', subcategoryId: subId});
  res.json({
    active: Boolean(nextActive),
    message: nextActive ? 'Subcategoria ativada!' : 'Subcategoria desativada.',
  });
});

app.delete('/api/admin/subcategories/:subId', requireAdminPermission('manage_products'), (req: AuthedRequest, res: Response) => {
  const subId = Number(req.params.subId);
  const existing = db.prepare('SELECT id, name FROM subcategories WHERE id = ?').get(subId) as
    | {id: number; name: string}
    | undefined;
  if (!existing) {
    res.status(404).json({error: 'Subcategoria não encontrada.'});
    return;
  }
  const count = (db.prepare('SELECT COUNT(*) AS count FROM products WHERE subcategory_id = ?').get(subId) as {count: number}).count;
  if (count > 0) {
    res.status(400).json({error: 'Não é possível excluir subcategoria que possui produtos vinculados.'});
    return;
  }
  db.prepare('DELETE FROM subcategories WHERE id = ?').run(subId);
  logAudit(req.auth!.userId, req.auth!.email, 'DELETE_SUBCATEGORY', 'subcategory', subId, `Subcategoria removida: ${existing.name}`);
  broadcastEvent('catalog_updated', {reason: 'subcategory_deleted', subcategoryId: subId});
  res.json({message: 'Subcategoria excluída.'});
});

// Admin Orders
app.get('/api/admin/orders', requireAdminPermission('manage_orders'), (_req: AuthedRequest, res: Response) => {
  const orders = db
    .prepare(`
      SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.id DESC
    `)
    .all() as Record<string, unknown>[];

  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const payStmt = db.prepare('SELECT id, gateway, method, status, amount_cents, card_last4, card_brand, checkout_url FROM payments WHERE order_id = ?');
  const enriched = orders.map((o) => ({
    ...o,
    shipping_address: JSON.parse(String(o.shipping_address_json || '{}')),
    items: itemsStmt.all(o.id),
    payment: payStmt.get(o.id),
  }));
  res.json({orders: enriched});
});

app.patch('/api/admin/orders/:id/status', requireAdminPermission('manage_orders'), async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  const trackingCode = sanitizeText(req.body?.trackingCode, 60);
  const validStatuses = ['aguardando_pagamento', 'pago', 'em_separacao', 'enviado', 'entregue', 'cancelado'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({error: 'Status de pedido inválido.'});
    return;
  }

  const current = db
    .prepare(
      `SELECT o.id, o.status, o.order_number, o.tracking_code, u.email AS customer_email, u.full_name AS customer_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`
    )
    .get(id) as
    | {
        id: number;
        status: string;
        order_number: string;
        tracking_code: string;
        customer_email: string;
        customer_name: string;
      }
    | undefined;
  if (!current) {
    res.status(404).json({error: 'Pedido não encontrado.'});
    return;
  }

  db.transaction(() => {
    if (status === 'cancelado' && current.status !== 'cancelado') {
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(id) as {
        product_id: number;
        quantity: number;
      }[];
      const restore = db.prepare(
        "UPDATE products SET stock = stock + ?, sales_count = MAX(0, sales_count - ?), updated_at = datetime('now') WHERE id = ?"
      );
      for (const item of items) {
        restore.run(item.quantity, item.quantity, item.product_id);
      }
      db.prepare("UPDATE payments SET status = 'cancelled' WHERE order_id = ?").run(id);
    } else if (status === 'pago') {
      db.prepare("UPDATE orders SET payment_status = 'approved' WHERE id = ?").run(id);
      db.prepare("UPDATE payments SET status = 'approved' WHERE order_id = ?").run(id);
    }

    db.prepare(
      "UPDATE orders SET status = ?, tracking_code = COALESCE(NULLIF(?, ''), tracking_code), updated_at = datetime('now') WHERE id = ?"
    ).run(status, trackingCode, id);
    db.prepare(
      "UPDATE shipments SET status = ?, tracking_code = COALESCE(NULLIF(?, ''), tracking_code), updated_at = datetime('now') WHERE order_id = ?"
    ).run(status, trackingCode, id);
    logAudit(
      req.auth!.userId,
      req.auth!.email,
      'UPDATE_ORDER_STATUS',
      'order',
      id,
      `Pedido ${current.order_number}: ${current.status} -> ${status}`
    );
  })();

  broadcastEvent('catalog_updated', {reason: 'order_status_changed'});
  broadcastEvent('order_updated', {orderId: id, status});

  let emailDispatched = false;
  if (status !== current.status || (trackingCode && trackingCode !== current.tracking_code)) {
    const emailRes = await sendOrderStatusEmail({
      to: current.customer_email,
      customerName: current.customer_name,
      orderNumber: current.order_number,
      status,
      trackingCode: trackingCode || current.tracking_code,
    });
    emailDispatched = emailRes.dispatched;
  }

  res.json({message: 'Status do pedido atualizado.', emailDispatched});
});

// Admin Customers (masked CPF for LGPD privacy)
app.get('/api/admin/customers', requireAdminPermission('manage_customers'), (_req: AuthedRequest, res: Response) => {
  const customers = db
    .prepare(`
      SELECT u.id, u.full_name, u.cpf, u.email, u.phone, u.created_at,
        COUNT(o.id) AS orders_count,
        COALESCE(SUM(CASE WHEN o.status != 'cancelado' THEN o.total_cents ELSE 0 END), 0) AS total_spent_cents
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'customer' AND u.active = 1
      GROUP BY u.id
      ORDER BY u.id DESC
    `)
    .all() as {
      id: number;
      full_name: string;
      cpf: string | null;
      email: string;
      phone: string;
      created_at: string;
      orders_count: number;
      total_spent_cents: number;
    }[];

  res.json({
    customers: customers.map((c) => ({
      id: c.id,
      full_name: c.full_name,
      cpf_masked: c.cpf ? maskCpf(c.cpf) : '***.***.***-**',
      email: c.email,
      phone: c.phone,
      created_at: c.created_at,
      orders_count: c.orders_count,
      total_spent_cents: c.total_spent_cents,
    })),
  });
});

// Admin Banners
app.get('/api/admin/banners', requireAdminPermission('manage_banners'), (_req: AuthedRequest, res: Response) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id ASC').all();
  res.json({banners});
});

app.post('/api/admin/banners', requireAdminPermission('manage_banners'), (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const title = sanitizeText(b.title, 120);
  const subtitle = sanitizeText(b.subtitle, 300);
  const ctaText = sanitizeText(b.ctaText || 'Explorar Coleção', 40);
  const ctaCategory = sanitizeText(b.ctaCategory || 'all', 40);
  const imageUrl = isSafeImageUrl(b.imageUrl)
    ? String(b.imageUrl).trim()
    : '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg';

  if (!title || !subtitle) {
    res.status(400).json({error: 'Informe título e subtítulo do banner.'});
    return;
  }

  const info = db
    .prepare('INSERT INTO banners (title, subtitle, cta_text, cta_category, image_url, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, 1)')
    .run(title, subtitle, ctaText, ctaCategory, imageUrl);
  logAudit(req.auth!.userId, req.auth!.email, 'CREATE_BANNER', 'banner', Number(info.lastInsertRowid), title);
  broadcastEvent('banner_updated', {reason: 'banner_created'});
  res.status(201).json({id: Number(info.lastInsertRowid)});
});

app.put('/api/admin/banners/:id', requireAdminPermission('manage_banners'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const title = sanitizeText(b.title, 120);
  const subtitle = sanitizeText(b.subtitle, 300);
  const ctaText = sanitizeText(b.ctaText || 'Explorar Coleção', 40);
  const ctaCategory = sanitizeText(b.ctaCategory || 'all', 40);
  const active = b.active === false ? 0 : 1;
  const imageUrl = isSafeImageUrl(b.imageUrl)
    ? String(b.imageUrl).trim()
    : '/src/assets/images/hero_suzy_bely_jewelry_1795522216462.jpg';

  if (!title || !subtitle) {
    res.status(400).json({error: 'Título e subtítulo obrigatórios.'});
    return;
  }
  db.prepare('UPDATE banners SET title = ?, subtitle = ?, cta_text = ?, cta_category = ?, image_url = ?, active = ? WHERE id = ?').run(
    title,
    subtitle,
    ctaText,
    ctaCategory,
    imageUrl,
    active,
    id
  );
  logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_BANNER', 'banner', id, title);
  broadcastEvent('banner_updated', {reason: 'banner_updated'});
  res.json({message: 'Banner atualizado.'});
});

app.delete('/api/admin/banners/:id', requireAdminPermission('manage_banners'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM banners WHERE id = ?').run(id);
  logAudit(req.auth!.userId, req.auth!.email, 'DELETE_BANNER', 'banner', id, 'Banner excluído');
  broadcastEvent('banner_updated', {reason: 'banner_deleted'});
  res.json({message: 'Banner removido.'});
});

// Admin Staff / Permissions
app.get('/api/admin/staff', requireAdminPermission('manage_staff'), (_req: AuthedRequest, res: Response) => {
  const staff = db
    .prepare("SELECT id, role, permissions_json, full_name, email, active, created_at FROM users WHERE role IN ('admin', 'staff') ORDER BY id ASC")
    .all() as {id: number; role: string; permissions_json: string; full_name: string; email: string; active: number; created_at: string}[];
  res.json({
    staff: staff.map((s) => ({
      ...s,
      active: Boolean(s.active),
      permissions: JSON.parse(s.permissions_json || '[]'),
    })),
  });
});

app.post('/api/admin/staff', requireAdminPermission('manage_staff'), (req: AuthedRequest, res: Response) => {
  const fullName = sanitizeText(req.body?.fullName, 120);
  const email = sanitizeText(req.body?.email, 140).toLowerCase();
  const password = String(req.body?.password || '');
  const permissions = Array.isArray(req.body?.permissions)
    ? req.body.permissions.filter((p: unknown) => typeof p === 'string')
    : ['manage_products', 'manage_orders'];

  if (fullName.length < 2 || !isValidEmail(email) || password.length < 6) {
    res.status(400).json({error: 'Informe nome, e-mail válido e senha com no mínimo 6 caracteres.'});
    return;
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    res.status(409).json({error: 'Este e-mail já está em uso.'});
    return;
  }

  const info = db
    .prepare(`
      INSERT INTO users (role, permissions_json, full_name, email, password_hash, lgpd_consent, lgpd_consent_at, email_verified, account_verified, active)
      VALUES ('staff', ?, ?, ?, ?, 1, datetime('now'), 1, 1, 1)
    `)
    .run(JSON.stringify(permissions), fullName, email, hashPassword(password));

  logAudit(req.auth!.userId, req.auth!.email, 'CREATE_STAFF', 'user', Number(info.lastInsertRowid), `Colaboradora: ${email}`);
  res.status(201).json({id: Number(info.lastInsertRowid), message: 'Colaborador cadastrado com permissões definidas.'});
});

app.patch('/api/admin/staff/:id', requireAdminPermission('manage_staff'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT id, role, email FROM users WHERE id = ?').get(id) as {
    id: number;
    role: string;
    email: string;
  } | undefined;
  if (!target || target.role === 'admin') {
    res.status(400).json({error: 'Não é possível alterar permissões do administrador principal por esta ação.'});
    return;
  }

  const permissions = Array.isArray(req.body?.permissions)
    ? req.body.permissions.filter((p: unknown) => typeof p === 'string')
    : [];
  const active = req.body?.active === false ? 0 : 1;

  db.prepare("UPDATE users SET permissions_json = ?, active = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(permissions),
    active,
    id
  );
  logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_STAFF', 'user', id, `${target.email} ativo=${active}`);
  res.json({message: 'Permissões atualizadas.'});
});

// Admin Store Settings (Payments, PIX, Shipping, Contact & SMTP Emails / SMS)
app.get('/api/admin/settings', requireAdminPermission('manage_settings'), (_req: AuthedRequest, res: Response) => {
  res.json({
    settings: serializeAdminSettings(getStoreSettings()),
    recentEmails: getRecentEmailLogs(12),
    recentSms: getRecentSmsLogs(10),
  });
});

app.put('/api/admin/settings', requireAdminPermission('manage_settings'), (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const enablePix = b.enablePix !== false ? 1 : 0;
  const enableCreditCard = b.enableCreditCard !== false ? 1 : 0;
  const enableBoleto = b.enableBoleto !== false ? 1 : 0;

  if (!enablePix && !enableCreditCard && !enableBoleto) {
    res.status(400).json({error: 'Mantenha pelo menos uma forma de pagamento ativa para os clientes.'});
    return;
  }

  const validKeyTypes = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const;
  const pixKeyType = validKeyTypes.includes(b.pixKeyType) ? b.pixKeyType : 'cpf';
  const pixKey = sanitizeText(b.pixKey || '', 140);
  const pixMerchantName = sanitizeText(b.pixMerchantName || 'SUZY BELY BIJUTERIAS', 40) || 'SUZY BELY BIJUTERIAS';
  const pixMerchantCity = sanitizeText(b.pixMerchantCity || 'JI-PARANA', 30) || 'JI-PARANA';
  const pixDiscountPercent = Math.max(0, Math.min(30, Math.round(Number(b.pixDiscountPercent) || 0)));
  const maxInstallments = Math.max(1, Math.min(12, Math.round(Number(b.maxInstallments) || 1)));

  const rawPaymentLink = typeof b.externalPaymentLink === 'string' ? b.externalPaymentLink.trim() : '';
  const externalPaymentLink = rawPaymentLink ? isSafeExternalHttpUrl(rawPaymentLink) : '';
  if (rawPaymentLink && !externalPaymentLink) {
    res.status(400).json({error: 'O link de pagamento externo deve começar com https:// ou http:// válido.'});
    return;
  }

  const freeShippingThresholdCents = Math.max(0, Math.round(Number(b.freeShippingThresholdCents) || 0));
  const shippingMode = b.shippingMode === 'fixed' ? 'fixed' : 'regional';
  const fixedPacCents = Math.max(0, Math.round(Number(b.fixedPacCents) || 0));
  const fixedSedexCents = Math.max(0, Math.round(Number(b.fixedSedexCents) || 0));
  const shippingExtraDays = Math.max(0, Math.min(30, Math.round(Number(b.shippingExtraDays) || 0)));

  const localDeliveryEnabled = b.localDeliveryEnabled !== false ? 1 : 0;
  const localDeliveryLabel = sanitizeText(b.localDeliveryLabel || 'Entrega Local / Retirada (Ji-Paraná, RO)', 100);
  const localDeliveryPriceCents = Math.max(0, Math.round(Number(b.localDeliveryPriceCents) || 0));
  const localDeliveryDays = Math.max(1, Math.min(30, Math.round(Number(b.localDeliveryDays) || 1)));

  const rawWhatsappDigits = onlyDigits(String(b.whatsappNumber || '')).slice(0, 15);
  if (rawWhatsappDigits && (rawWhatsappDigits.length < 10 || rawWhatsappDigits.length > 15)) {
    res.status(400).json({error: 'Informe um número de WhatsApp válido com DDD (ex: 69999990000) ou deixe em branco.'});
    return;
  }
  const whatsappNumber = rawWhatsappDigits;
  const whatsappMessage =
    sanitizeText(b.whatsappMessage || 'Olá Suzy Bely! Gostaria de falar com a loja sobre as bijuterias e acessórios.', 240) ||
    'Olá Suzy Bely! Gostaria de falar com a loja sobre as bijuterias e acessórios.';
  const contactEmail = sanitizeText(b.contactEmail || 'atendimento@suzybely.com.br', 140).toLowerCase();
  if (contactEmail && !isValidEmail(contactEmail)) {
    res.status(400).json({error: 'Informe um e-mail de atendimento válido.'});
    return;
  }
  const storeCity = sanitizeText(b.storeCity || 'Ji-Paraná, RO', 80) || 'Ji-Paraná, RO';

  const emailSenderName = sanitizeText(b.emailSenderName || 'Suzy Bely Bijuterias', 80) || 'Suzy Bely Bijuterias';
  const emailOnRegister = b.emailOnRegister !== false ? 1 : 0;
  const emailOnOrder = b.emailOnOrder !== false ? 1 : 0;
  const emailOnStatus = b.emailOnStatus !== false ? 1 : 0;
  const emailNotifyOwner = b.emailNotifyOwner !== false ? 1 : 0;

  db.prepare(`
    UPDATE store_settings SET
      enable_pix = ?,
      enable_credit_card = ?,
      enable_boleto = ?,
      pix_key = ?,
      pix_key_type = ?,
      pix_merchant_name = ?,
      pix_merchant_city = ?,
      pix_discount_percent = ?,
      max_installments = ?,
      external_payment_link = ?,
      free_shipping_threshold_cents = ?,
      shipping_mode = ?,
      fixed_pac_cents = ?,
      fixed_sedex_cents = ?,
      shipping_extra_days = ?,
      local_delivery_enabled = ?,
      local_delivery_label = ?,
      local_delivery_price_cents = ?,
      local_delivery_days = ?,
      whatsapp_number = ?,
      whatsapp_message = ?,
      contact_email = ?,
      store_city = ?,
      email_sender_name = ?,
      email_on_register = ?,
      email_on_order = ?,
      email_on_status = ?,
      email_notify_owner = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `).run(
    enablePix,
    enableCreditCard,
    enableBoleto,
    pixKey,
    pixKeyType,
    pixMerchantName,
    pixMerchantCity,
    pixDiscountPercent,
    maxInstallments,
    externalPaymentLink,
    freeShippingThresholdCents,
    shippingMode,
    fixedPacCents,
    fixedSedexCents,
    shippingExtraDays,
    localDeliveryEnabled,
    localDeliveryLabel,
    localDeliveryPriceCents,
    localDeliveryDays,
    whatsappNumber,
    whatsappMessage,
    contactEmail,
    storeCity,
    emailSenderName,
    emailOnRegister,
    emailOnOrder,
    emailOnStatus,
    emailNotifyOwner
  );

  logAudit(req.auth!.userId, req.auth!.email, 'UPDATE_STORE_SETTINGS', 'store_settings', 1, 'Configurações de pagamento, frete, contato e e-mail atualizadas.');
  broadcastEvent('settings_updated', {reason: 'admin_settings_saved'});
  broadcastEvent('catalog_updated', {reason: 'settings_updated'});

  res.json({
    message: 'Configurações salvas e aplicadas à loja em tempo real!',
    settings: serializeAdminSettings(getStoreSettings()),
    recentEmails: getRecentEmailLogs(12),
  });
});

app.post('/api/admin/settings/test-email', requireAdminPermission('manage_settings'), async (req: AuthedRequest, res: Response) => {
  const recipient = sanitizeText(req.body?.to, 140).toLowerCase();
  if (!isValidEmail(recipient)) {
    res.status(400).json({error: 'Informe um endereço de e-mail válido para receber o teste.'});
    return;
  }

  const result = await sendTestEmail({to: recipient});
  const recentEmails = getRecentEmailLogs(12);

  if (result.dispatched) {
    res.json({
      ok: true,
      message: `E-mail de teste enviado com sucesso para ${recipient}!`,
      recentEmails,
    });
    return;
  }

  res.status(result.status === 'skipped_no_smtp' ? 400 : 502).json({
    error: result.errorMessage || 'Não foi possível enviar o e-mail de teste.',
    recentEmails,
  });
});

// Vite / Static Frontend Serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Suzy Bely server running at http://localhost:${PORT}`);
  });
}

startServer();
