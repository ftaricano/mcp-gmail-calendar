import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import dns from 'node:dns';
import net from 'node:net';
import { Logger } from './Logger.js';

const logger = new Logger('Validator');

// Environment validation schema
const envSchema = z.object({
  GOOGLE_CREDENTIALS_PATH: z.string().optional().default('./credentials.json'),
  OAUTH_CALLBACK_PORT: z.string().optional().default('3000'),
  TOKENS_PATH: z.string().optional().default('./tokens'),
  CACHE_TTL: z.string().optional().default('300'),
  CACHE_CHECK_PERIOD: z.string().optional().default('60'),
  MAX_EMAIL_RESULTS: z.string().optional().default('50'),
  MAX_ATTACHMENT_SIZE: z.string().optional().default('25000000'),
  MAX_CALENDAR_EVENTS: z.string().optional().default('100'),
  DEFAULT_CALENDAR_TIMEZONE: z.string().optional().default('America/New_York'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
  LOG_FILE_PATH: z.string().optional().default('./logs/mcp-gmail-calendar.log'),
  ENABLE_HTML_SANITIZATION: z.string().optional().default('true'),
  ALLOWED_ATTACHMENT_TYPES: z.string().optional().default('pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,jpg,jpeg,png,gif,zip'),
  TEMPLATE_PATH: z.string().optional().default('./templates'),
  DEFAULT_EMAIL_THEME: z.enum(['professional', 'modern', 'minimal', 'corporate']).optional().default('professional'),
});

// Email validation schemas
export const emailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  body: z.string().optional(),
  bodyHtml: z.string().optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  replyTo: z.string().email().optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1),
    content: z.union([z.string(), z.instanceof(Buffer)]),
    contentType: z.string().optional(),
  })).optional(),
  templateId: z.string().optional(),
  templateData: z.record(z.any()).optional(),
  importance: z.enum(['low', 'normal', 'high']).optional(),
}).refine(data => data.body || data.bodyHtml, {
  message: "Either body or bodyHtml must be provided",
});

// Calendar event validation schema
export const calendarEventSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
    timeZone: z.string().optional(),
  }).refine(data => data.dateTime || data.date, {
    message: "Either dateTime or date must be provided for start",
  }),
  end: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
    timeZone: z.string().optional(),
  }).refine(data => data.dateTime || data.date, {
    message: "Either dateTime or date must be provided for end",
  }),
  attendees: z.array(z.object({
    email: z.string().email(),
    displayName: z.string().optional(),
    responseStatus: z.enum(['needsAction', 'declined', 'tentative', 'accepted']).optional(),
    optional: z.boolean().optional(),
    organizer: z.boolean().optional(),
  })).optional(),
  reminders: z.object({
    useDefault: z.boolean().optional(),
    overrides: z.array(z.object({
      method: z.enum(['email', 'popup']),
      minutes: z.number().min(0),
    })).optional(),
  }).optional(),
  recurrence: z.array(z.string()).optional(),
  colorId: z.string().optional(),
  visibility: z.enum(['default', 'public', 'private', 'confidential']).optional(),
  conferenceData: z.any().optional(),
  attachments: z.array(z.object({
    fileUrl: z.string().url(),
    title: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional(),
});

// Attachment validation
export const attachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
  size: z.number().min(1),
  mimeType: z.string().min(1),
});

export function validateEnvironment(): void {
  try {
    const env = envSchema.parse(process.env);
    logger.info('Environment validation passed');
    
    // Validate numeric values
    const port = parseInt(env.OAUTH_CALLBACK_PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('OAUTH_CALLBACK_PORT must be a valid port number');
    }

    const cacheTTL = parseInt(env.CACHE_TTL);
    if (isNaN(cacheTTL) || cacheTTL < 0) {
      throw new Error('CACHE_TTL must be a valid positive number');
    }

    const maxEmailResults = parseInt(env.MAX_EMAIL_RESULTS);
    if (isNaN(maxEmailResults) || maxEmailResults < 1 || maxEmailResults > 500) {
      throw new Error('MAX_EMAIL_RESULTS must be between 1 and 500');
    }

    const maxAttachmentSize = parseInt(env.MAX_ATTACHMENT_SIZE);
    if (isNaN(maxAttachmentSize) || maxAttachmentSize < 1) {
      throw new Error('MAX_ATTACHMENT_SIZE must be a valid positive number');
    }

    const maxCalendarEvents = parseInt(env.MAX_CALENDAR_EVENTS);
    if (isNaN(maxCalendarEvents) || maxCalendarEvents < 1 || maxCalendarEvents > 2500) {
      throw new Error('MAX_CALENDAR_EVENTS must be between 1 and 2500');
    }

  } catch (error) {
    logger.error('Environment validation failed:', error);
    throw error;
  }
}

export async function validateCredentials(): Promise<void> {
  try {
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
    
    // Check if credentials file exists
    try {
      await fs.access(credentialsPath);
    } catch (error) {
      throw new Error(`Google credentials file not found at: ${credentialsPath}`);
    }

    // Validate credentials file format
    const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
    const credentials = JSON.parse(credentialsContent);
    
    const credentialsSchema = z.object({
      web: z.object({
        client_id: z.string().min(1),
        client_secret: z.string().min(1),
        redirect_uris: z.array(z.string().url()),
      }).optional(),
      installed: z.object({
        client_id: z.string().min(1),
        client_secret: z.string().min(1),
        redirect_uris: z.array(z.string().url()),
      }).optional(),
    }).refine(data => data.web || data.installed, {
      message: "Credentials must contain either 'web' or 'installed' configuration",
    });

    credentialsSchema.parse(credentials);
    logger.info('Google credentials validation passed');

  } catch (error) {
    logger.error('Credentials validation failed:', error);
    throw error;
  }
}

export function validateEmail(data: unknown): z.infer<typeof emailSchema> {
  return emailSchema.parse(data);
}

export function validateCalendarEvent(data: unknown): z.infer<typeof calendarEventSchema> {
  return calendarEventSchema.parse(data);
}

export function validateAttachment(data: unknown): z.infer<typeof attachmentSchema> {
  return attachmentSchema.parse(data);
}

export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

export function isValidUrl(url: string): boolean {
  return z.string().url().safeParse(url).success;
}

// SSRF protection: only allow http(s) requests to public hosts. Rejects
// loopback, private, link-local and IPv4-mapped IPv6 ranges so that
// attacker-controlled URLs (e.g. an email link) cannot reach internal
// services such as 127.0.0.1:3000/oauth2callback or cloud metadata.
function isBlockedIpv4(host: string): boolean {
  const octets = host.split('.');
  if (octets.length !== 4) return false;

  const parts = octets.map(o => Number(o));
  if (parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;

  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // private 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // private 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local / cloud metadata 169.254.0.0/16

  return false;
}

// Block every IPv6 address that is not global-unicast. Fail-closed: any form we
// cannot confidently classify as a routable public address is rejected. The host
// must already be normalized (lowercase, no surrounding brackets).
export function isBlockedIpv6(host: string): boolean {
  // Sanity-check the literal form first. Anything net.isIPv6 cannot parse is
  // not a usable IPv6 address here, so reject it (fail-closed).
  if (!net.isIPv6(host)) return true;

  // Mapped / embedded IPv4 forms. The WHATWG URL parser may keep the dotted
  // form (::ffff:127.0.0.1) or normalize to hex (::ffff:7f00:1); handle both,
  // and reject any other ::ffff embedding we don't expect.
  if (host.startsWith('::ffff:')) {
    const dotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotted) return isBlockedIpv4(dotted[1]);

    const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isBlockedIpv4(ipv4);
    }

    // Unrecognized ::ffff: shape -> fail-closed.
    return true;
  }

  // Loopback and unspecified.
  if (host === '::1' || host === '::') return true;

  // IPv4-compatible / deprecated embeddings such as ::a.b.c.d or ::<hex>:<hex>
  // (a single :: prefix with no ffff marker). These are deprecated and easy to
  // abuse to reach internal IPv4 -> fail-closed.
  if (host.startsWith('::') && host !== '::') return true;

  // Allowlist, not blocklist: only global-unicast 2000::/3 (first hextet
  // 0x2000..0x3fff) is routable public space. Everything else is non-global and
  // fail-closed — ULA fc00::/7, link-local fe80::/10, site-local fec0::/10
  // (deprecated), multicast ff00::/8, and any other special range.
  const firstHextet = parseInt(host.split(':')[0] || '0', 16);
  return !(firstHextet >= 0x2000 && firstHextet <= 0x3fff);
}

// Returns true when an IP literal (v4 or v6, no brackets) targets a
// loopback/private/link-local/non-global range that must not be fetched.
export function isBlockedIp(host: string): boolean {
  const ipType = net.isIP(host);
  if (ipType === 4) return isBlockedIpv4(host);
  if (ipType === 6) return isBlockedIpv6(host);
  // Not an IP literal; caller must resolve hostnames before classifying.
  return false;
}

export function isSafeFetchUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // URL hostnames keep IPv6 in brackets; strip them for inspection.
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }

  if (host.includes(':')) {
    return !isBlockedIpv6(host);
  }

  if (isBlockedIpv4(host)) {
    return false;
  }

  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

type DnsLookupAll = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookupAll: DnsLookupAll = (hostname, options) =>
  dns.promises.lookup(hostname, options);

/**
 * Fail-closed SSRF guard for an outbound URL. Validates the scheme and host. For
 * IP literals the range checks are applied directly; for hostnames every A/AAAA
 * address returned by DNS is validated and the call is rejected if ANY resolved
 * address falls in a blocked range. Throws UnsafeUrlError when unsafe.
 *
 * Returns the resolved addresses so callers can pin the connection to an
 * already-validated IP (anti-rebinding).
 */
export async function assertSafePublicUrl(
  url: string,
  lookupAll: DnsLookupAll = defaultLookupAll,
): Promise<{ host: string; addresses: string[] }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError('Malformed URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) {
    throw new UnsafeUrlError('URL host is not allowed');
  }

  // IP literal: classify directly, no DNS.
  const literalType = net.isIP(host);
  if (literalType !== 0) {
    if (isBlockedIp(host)) {
      throw new UnsafeUrlError('URL host resolves to a blocked address range');
    }
    return { host, addresses: [host] };
  }

  // Hostname: resolve and validate EVERY address. Fail-closed if resolution
  // fails or yields no addresses.
  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookupAll(host, { all: true });
  } catch {
    throw new UnsafeUrlError('Unable to resolve URL host');
  }

  if (!resolved || resolved.length === 0) {
    throw new UnsafeUrlError('URL host did not resolve to any address');
  }

  const addresses = resolved.map((r) => r.address);
  for (const address of addresses) {
    if (isBlockedIp(address.toLowerCase())) {
      throw new UnsafeUrlError('URL host resolves to a blocked address range');
    }
  }

  return { host, addresses };
}

export function sanitizeFilename(filename: string): string {
  // Remove or replace dangerous characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .substring(0, 255); // Limit length
}

export function validateAttachmentType(filename: string): boolean {
  const allowedTypes = (process.env.ALLOWED_ATTACHMENT_TYPES || '').split(',').map(t => t.trim());
  if (allowedTypes.length === 0) return true; // No restrictions
  
  const extension = path.extname(filename).toLowerCase().substring(1);
  return allowedTypes.includes(extension);
}

export function validateAttachmentSize(size: number): boolean {
  const maxSize = parseInt(process.env.MAX_ATTACHMENT_SIZE || '25000000');
  return size <= maxSize;
}

// Date/time validation utilities
export function isValidDateTime(dateTime: string): boolean {
  try {
    const date = new Date(dateTime);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Security validation
export function validateHtmlContent(html: string): boolean {
  const enableSanitization = process.env.ENABLE_HTML_SANITIZATION === 'true';
  if (!enableSanitization) return true;
  
  // Basic checks for potentially dangerous content
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(html));
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string, public value?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}