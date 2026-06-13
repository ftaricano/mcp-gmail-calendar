import type { Command } from 'commander';
import { ValidationCliError } from './errors.js';
import type { OutputFormat } from './output/formatters.js';

export interface CliGlobals {
  account?: string;
  format?: string;
  quiet?: boolean;
  dryRun?: boolean;
}

export function parseOutputFormat(value: string): OutputFormat {
  if (['json', 'table', 'jsonl', 'tsv', 'yaml'].includes(value)) {
    return value as OutputFormat;
  }
  throw new ValidationCliError(`Unsupported format: ${value}`);
}

export function addGlobalOptions(program: Command): Command {
  return program
    .option('-a, --account <email>', 'Google account email')
    .option('-f, --format <format>', 'Output format: json, table, jsonl, tsv, yaml', 'json')
    .option('-q, --quiet', 'Suppress non-data output')
    .option('--dry-run', 'Preview mutating operations when supported')
    .showHelpAfterError();
}

export function isDryRun(command: Command): boolean {
  return Boolean(command.optsWithGlobals<CliGlobals>().dryRun);
}
