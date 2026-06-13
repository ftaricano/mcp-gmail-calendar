const SENSITIVE_KEYS = new Set([
  'authorization',
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'client_secret',
  'api_key',
  'apikey',
  'password',
  'secret',
]);

export class CliError extends Error {
  constructor(message: string, public readonly code = 1, public readonly details?: unknown) {
    super(message);
    this.name = 'CliError';
  }
}

export class AuthCliError extends CliError {
  constructor(message: string, details?: unknown) { super(message, 2, details); this.name = 'AuthCliError'; }
}
export class NotFoundCliError extends CliError {
  constructor(message: string, details?: unknown) { super(message, 3, details); this.name = 'NotFoundCliError'; }
}
export class ValidationCliError extends CliError {
  constructor(message: string, details?: unknown) { super(message, 4, details); this.name = 'ValidationCliError'; }
}
export class RateLimitCliError extends CliError {
  constructor(message: string, details?: unknown) { super(message, 5, details); this.name = 'RateLimitCliError'; }
}

function sanitizeDetails(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.replace(/Bearer\s+[A-Za-z0-9._~+\-/=]+/gi, 'Bearer [REDACTED]');
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitizeDetails(item, seen));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (SENSITIVE_KEYS.has(normalized) || normalized.endsWith('_token') || normalized.includes('secret')) {
      out[key] = '[REDACTED]';
    } else if (normalized === 'headers') {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitizeDetails(item, seen);
    }
  }
  return out;
}

export function errorPayload(error: unknown): { error: { type: string; message: string; details?: unknown } } {
  if (error instanceof CliError) {
    const payload: { error: { type: string; message: string; details?: unknown } } = {
      error: { type: error.name, message: error.message },
    };
    if (error.details !== undefined) payload.error.details = sanitizeDetails(error.details);
    return payload;
  }
  if (error instanceof Error) {
    return { error: { type: error.name || 'Error', message: sanitizeDetails(error.message) as string } };
  }
  return { error: { type: 'Error', message: String(sanitizeDetails(error)) } };
}

export function exitCodeFor(error: unknown): number {
  return error instanceof CliError ? error.code : 1;
}
