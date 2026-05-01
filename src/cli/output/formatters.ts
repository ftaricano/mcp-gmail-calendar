import Table from 'cli-table3';

export type OutputFormat = 'json' | 'table' | 'jsonl' | 'tsv' | 'yaml';

function normalizeItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: unknown[] }).items;
  }
  return [data];
}

function columnsFor(items: unknown[]): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const key of Object.keys(item)) keys.add(key);
    }
  }
  return [...keys];
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function tsvSafe(value: unknown): string {
  const text = stringifyCell(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function formatOutput(data: unknown, format: OutputFormat = 'json'): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, process.stdout.isTTY ? 2 : 0);
    case 'jsonl': {
      const items = normalizeItems(data);
      return items.map((item) => JSON.stringify(item)).join('\n');
    }
    case 'tsv': {
      const items = normalizeItems(data);
      const columns = columnsFor(items);
      if (columns.length === 0) return '';
      const rows = items.map((item) => columns.map((col) => tsvSafe((item as Record<string, unknown>)[col])).join('\t'));
      return [columns.join('\t'), ...rows].join('\n');
    }
    case 'table': {
      const items = normalizeItems(data);
      const columns = columnsFor(items);
      if (columns.length === 0) return stringifyCell(data);
      const table = new Table({ head: columns, wordWrap: true, colWidths: columns.map(() => 32) });
      for (const item of items) table.push(columns.map((col) => stringifyCell((item as Record<string, unknown>)[col])));
      return table.toString();
    }
    case 'yaml':
      throw new Error('YAML output is not bundled yet. Use --format json, table, jsonl, or tsv.');
    default:
      throw new Error(`Unsupported output format: ${format satisfies never}`);
  }
}
