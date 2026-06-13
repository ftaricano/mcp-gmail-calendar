import fs from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import type { SendEmailOptions } from '../services/GmailService.js';
import { ValidationCliError } from './errors.js';
import { parseEmailList, parseStructuredJsonInput, readTextInput } from './parsers.js';

export interface MailPayloadOptions {
  to?: string;
  subject?: string;
  body?: string;
  bodyFile?: string;
  html?: string | boolean;
  htmlFile?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  attachment?: string[];
  templateId?: string;
  templateData?: string;
  templateDataFile?: string;
  importance?: 'low' | 'normal' | 'high';
}

export interface ResolvedMailComposeInputs {
  body?: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: NonNullable<SendEmailOptions['attachments']>;
  templateId?: string;
  templateData?: Record<string, unknown>;
  importance?: 'low' | 'normal' | 'high';
}

function requiredString(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new ValidationCliError(`${label} is required.`);
  return normalized;
}

async function loadAttachments(paths: string[]): Promise<NonNullable<SendEmailOptions['attachments']>> {
  const attachments: NonNullable<SendEmailOptions['attachments']> = [];

  for (const filePath of paths) {
    const content = await fs.readFile(filePath);
    attachments.push({
      filename: path.basename(filePath),
      content,
      contentType: mime.lookup(filePath) || 'application/octet-stream',
    });
  }

  return attachments;
}

async function resolveBodyContent(
  options: MailPayloadOptions,
  readStdin: () => Promise<string>,
): Promise<{ body?: string; bodyHtml?: string }> {
  const body = await readTextInput(
    { value: options.body, file: options.bodyFile, readStdin },
    'body',
  );

  const htmlValue = typeof options.html === 'string' ? options.html : undefined;
  let bodyHtml = await readTextInput(
    { value: htmlValue, file: options.htmlFile, readStdin },
    'html',
  );

  if (options.html === true && body) {
    bodyHtml = body;
  }

  return { body: body || undefined, bodyHtml: bodyHtml || undefined };
}

export async function resolveMailComposeInputs(
  options: MailPayloadOptions,
  readStdin: () => Promise<string>,
): Promise<ResolvedMailComposeInputs> {
  const { body, bodyHtml } = await resolveBodyContent(options, readStdin);
  const templateData = await parseStructuredJsonInput<Record<string, unknown>>(
    {
      json: options.templateData,
      jsonFile: options.templateDataFile,
      readStdin,
    },
    'templateData',
  );

  const payload: ResolvedMailComposeInputs = {};
  if (body) payload.body = body;
  if (bodyHtml) payload.bodyHtml = bodyHtml;
  if (options.cc) payload.cc = parseEmailList(options.cc);
  if (options.bcc) payload.bcc = parseEmailList(options.bcc);
  if (options.replyTo) payload.replyTo = requiredString(options.replyTo, 'replyTo');
  if (options.templateId) payload.templateId = requiredString(options.templateId, 'templateId');
  if (templateData) payload.templateData = templateData;
  if (options.importance) payload.importance = options.importance;
  if (options.attachment?.length) payload.attachments = await loadAttachments(options.attachment);

  return payload;
}

export async function buildMailPayload(
  options: MailPayloadOptions,
  readStdin: () => Promise<string>,
): Promise<SendEmailOptions> {
  return {
    ...(await resolveMailComposeInputs(options, readStdin)),
    to: parseEmailList(requiredString(options.to, 'to')),
    subject: requiredString(options.subject, 'subject'),
  };
}

export async function buildMailPayloadPreview(
  options: MailPayloadOptions,
  readStdin: () => Promise<string>,
): Promise<Record<string, unknown>> {
  const { body, bodyHtml } = await resolveBodyContent(options, readStdin);
  const preview: Record<string, unknown> = {
    to: parseEmailList(requiredString(options.to, 'to')),
    subject: requiredString(options.subject, 'subject'),
  };

  if (body) preview.body = body;
  if (bodyHtml) preview.bodyHtml = bodyHtml;
  if (options.cc) preview.cc = parseEmailList(options.cc);
  if (options.bcc) preview.bcc = parseEmailList(options.bcc);
  if (options.replyTo) preview.replyTo = requiredString(options.replyTo, 'replyTo');
  if (options.templateId) preview.templateId = requiredString(options.templateId, 'templateId');
  if (options.importance) preview.importance = options.importance;
  if (options.attachment?.length) {
    preview.attachments = options.attachment.map((filePath) => ({
      path: filePath,
      filename: path.basename(filePath),
      contentType: mime.lookup(filePath) || 'application/octet-stream',
    }));
  }

  return preview;
}
