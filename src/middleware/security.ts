import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const DANGEROUS_KEYS = /^\$|\./;

const stripDangerousKeys = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripDangerousKeys);
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.test(key)) continue;
    result[key] = stripDangerousKeys(nested);
  }
  return result;
};

export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDangerousKeys(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = stripDangerousKeys(req.query) as Request['query'];
  }
  if (req.params && typeof req.params === 'object') {
    req.params = stripDangerousKeys(req.params) as Request['params'];
  }
  next();
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});

export const strictAuthRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in an hour.' },
});
