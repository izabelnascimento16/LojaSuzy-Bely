import crypto from 'node:crypto';
import type {Request, Response, NextFunction} from 'express';

// Ephemeral fallback secret for local preview if SESSION_SECRET is unset
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  try {
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    const originalBuf = Buffer.from(originalHex, 'hex');
    if (derivedBuf.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, originalBuf);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: number;
  role: 'customer' | 'admin' | 'staff';
  email: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');

    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function maskCpf(cpfDigits: string): string {
  const digits = cpfDigits.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function sanitizeText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, maxLength);
}

export function isSafeImageUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/src/assets/') || trimmed.startsWith('/assets/')) return true;
  if (/^\/uploads\/(products|categories)\/[a-zA-Z0-9._-]+$/.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeExternalHttpUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim().slice(0, 400);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        res.status(403).json({error: 'Origem da requisição não autorizada.'});
        return;
      }
    } catch {
      res.status(403).json({error: 'Cabeçalho de origem inválido.'});
      return;
    }
  }

  const requestedWith = req.headers['x-requested-with'];
  const hasAuth = Boolean(req.headers.authorization?.startsWith('Bearer '));
  if (!requestedWith && !hasAuth) {
    res.status(403).json({error: 'Cabeçalho de verificação CSRF ausente.'});
    return;
  }

  next();
}
