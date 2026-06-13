import fs from 'node:fs/promises';
import { ValidationCliError } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface JsonInputOptions {
  json?: string;
  jsonFile?: string;
  readStdin: () => Promise<string>;
}

export interface TextInputOptions {
  value?: string;
  file?: string;
  readStdin: () => Promise<string>;
}

export function collectValues(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationCliError(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseBooleanInput(value: boolean | string, label: string): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  throw new ValidationCliError(`${label} must be a boolean.`);
}

export function parseEnumValue<const T extends readonly string[]>(value: string, allowed: T, label: string): T[number] {
  const normalized = value.trim();
  if ((allowed as readonly string[]).includes(normalized)) return normalized as T[number];
  throw new ValidationCliError(`${label} must be one of: ${allowed.join(', ')}.`);
}

export function parseCsvList(value?: string | string[]): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseEmailList(value?: string | string[]): string[] {
  const emails = parseCsvList(value);
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      throw new ValidationCliError(`Invalid email address: ${email}`);
    }
  }
  return emails;
}

export async function readTextInput(options: TextInputOptions, label: string): Promise<string | undefined> {
  if (options.value && options.file) {
    throw new ValidationCliError(`Use either ${label} inline input or file input, not both.`);
  }
  if (options.file) {
    return fs.readFile(options.file, 'utf-8');
  }
  if (options.value === '-') {
    return options.readStdin();
  }
  return options.value;
}

export async function parseStructuredJsonInput<T>(
  options: JsonInputOptions,
  label: string,
): Promise<T | undefined> {
  const text = await readTextInput(
    { value: options.json, file: options.jsonFile, readStdin: options.readStdin },
    label,
  );

  if (text === undefined) return undefined;

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ValidationCliError(`${label} must be valid JSON.`, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export function normalizeDocsExportMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    text: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    md: 'text/markdown',
    markdown: 'text/markdown',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  return aliases[normalized] ?? value;
}

export function buildDocsCreatePayload(title: string, content?: string): {
  title: string;
  content?: string;
} {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new ValidationCliError('Document title is required.');
  return content ? { title: normalizedTitle, content } : { title: normalizedTitle };
}

export function buildSheetsValuesPayload(
  values: unknown,
  valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
): {
  values: string[][];
  valueInputOption: 'RAW' | 'USER_ENTERED';
} {
  if (!Array.isArray(values) || !values.every((row) => Array.isArray(row))) {
    throw new ValidationCliError('Sheets values payload must be a JSON matrix.');
  }

  return {
    values: (values as unknown[][]).map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))),
    valueInputOption,
  };
}
