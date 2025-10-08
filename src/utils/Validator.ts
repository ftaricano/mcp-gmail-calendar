import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
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