import { Command } from 'commander';
import dotenv from 'dotenv';
import { GoogleAuthManager } from '../auth/GoogleAuthManager.js';
import { CacheManager } from '../utils/CacheManager.js';
import { formatOutput, OutputFormat } from './output/formatters.js';
import { errorPayload, exitCodeFor, ValidationCliError } from './errors.js';
import { calendarFor, gmailFor, requireKnownAccount, resolveAccount, switchCurrentAccount } from './context.js';
import { configPath, loadConfig, loadState, saveConfig, saveState, statePath } from './config.js';

dotenv.config();

function collect(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

function parseFormat(value: string): OutputFormat {
  if (['json', 'table', 'jsonl', 'tsv', 'yaml'].includes(value)) return value as OutputFormat;
  throw new ValidationCliError(`Unsupported format: ${value}`);
}

function emit(program: Command, data: unknown): void {
  const opts = program.optsWithGlobals();
  process.stdout.write(`${formatOutput(data, parseFormat(opts.format || 'json'))}\n`);
}

async function withErrors(program: Command, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    process.stderr.write(`${JSON.stringify(errorPayload(error), null, 2)}\n`);
    process.exitCode = exitCodeFor(error);
  }
}

export function createProgram(): Command {
  const authManager = new GoogleAuthManager();
  const cache = new CacheManager();

  const program = new Command();
  const cleanupAndExit = (signal: NodeJS.Signals) => {
    authManager.cleanupAuthServers();
    process.stderr.write(`Received ${signal}; closed pending OAuth listeners.\n`);
    process.exit(130);
  };
  process.once('SIGINT', cleanupAndExit);
  process.once('SIGTERM', cleanupAndExit);

  program
    .name('gws')
    .description('CLI-first Google Workspace tool with MCP compatibility')
    .option('-a, --account <email>', 'Google account email')
    .option('-f, --format <format>', 'Output format: json, table, jsonl, tsv, yaml', 'json')
    .option('-q, --quiet', 'Suppress non-data output')
    .option('--dry-run', 'Preview mutating operations when supported')
    .showHelpAfterError();

  const auth = program.command('auth').description('Authenticate and manage Google accounts');
  auth.command('login')
    .description('Start OAuth login for an account')
    .requiredOption('-a, --account <email>', 'Account email')
    .option('-t, --type <type>', 'Account type: personal or workspace', 'workspace')
    .action((opts) => withErrors(program, async () => {
      await authManager.initialize();
      const url = await authManager.authenticate(opts.account, opts.type);
      if (url) emit(program, { account: opts.account, status: 'pending', authUrl: url });
      else emit(program, { account: opts.account, status: 'already_authenticated' });
    }));
  auth.command('list').description('List authenticated accounts').action(() => withErrors(program, async () => {
    emit(program, { accounts: await authManager.listAccounts(), current: (await loadState()).current });
  }));
  auth.command('current').description('Show current account').action(() => withErrors(program, async () => {
    const account = await resolveAccount(authManager, program.optsWithGlobals().account);
    emit(program, { account });
  }));
  auth.command('whoami').description('Alias for auth current').action(() => withErrors(program, async () => {
    const account = await resolveAccount(authManager, program.optsWithGlobals().account);
    emit(program, { account });
  }));
  auth.command('switch').description('Set default account').argument('<email>').action((email) => withErrors(program, async () => {
    await requireKnownAccount(authManager, email);
    await switchCurrentAccount(email);
    emit(program, { current: email });
  }));
  auth.command('logout').description('Remove local account token').argument('<email>').action((email) => withErrors(program, async () => {
    await authManager.removeAccount(email);
    const state = await loadState();
    if (state.current === email) await saveState({});
    emit(program, { removed: email });
  }));

  const config = program.command('config').description('Manage gws CLI config');
  config.command('path').description('Show config/state paths').action(() => withErrors(program, async () => {
    emit(program, { configPath: configPath(), statePath: statePath() });
  }));
  config.command('list').description('List config values').action(() => withErrors(program, async () => emit(program, await loadConfig())));
  config.command('get').argument('<key>').description('Get a config value').action((key) => withErrors(program, async () => {
    const cfg = await loadConfig();
    emit(program, { [key]: cfg[key] ?? null });
  }));
  config.command('set').argument('<key>').argument('<value>').description('Set a config value').action((key, value) => withErrors(program, async () => {
    const cfg = await loadConfig();
    cfg[key] = value;
    await saveConfig(cfg);
    emit(program, { [key]: value });
  }));

  const mail = program.command('mail').description('Gmail commands');
  mail.command('list')
    .option('--query <query>')
    .option('--label <labelId>', 'Filter by label id', collect, [])
    .option('--limit <n>', 'Maximum results', '50')
    .option('--page-token <token>')
    .option('--include-spam-trash')
    .action((opts) => withErrors(program, async () => {
      const email = await resolveAccount(authManager, program.optsWithGlobals().account);
      const gmail = await gmailFor(authManager, cache, email);
      const result = await gmail.listEmails({ maxResults: Number(opts.limit), pageToken: opts.pageToken, query: opts.query, labelIds: opts.label, includeSpamTrash: Boolean(opts.includeSpamTrash) });
      emit(program, { account: email, items: result.emails, nextPageToken: result.nextPageToken });
    }));
  mail.command('search').argument('<query>').option('--limit <n>', 'Maximum results', '50').action((query, opts) => withErrors(program, async () => {
    const email = await resolveAccount(authManager, program.optsWithGlobals().account);
    const gmail = await gmailFor(authManager, cache, email);
    emit(program, { account: email, items: await gmail.searchEmails(query, Number(opts.limit)) });
  }));
  mail.command('read').argument('<messageId>').action((messageId) => withErrors(program, async () => {
    const email = await resolveAccount(authManager, program.optsWithGlobals().account);
    const gmail = await gmailFor(authManager, cache, email);
    emit(program, await gmail.getEmailById(messageId));
  }));

  const cal = program.command('cal').description('Google Calendar commands');
  cal.command('calendars').description('List calendars').action(() => withErrors(program, async () => {
    const email = await resolveAccount(authManager, program.optsWithGlobals().account);
    const calendar = await calendarFor(authManager, cache, email);
    emit(program, { account: email, items: await calendar.listCalendars() });
  }));
  const events = cal.command('events').description('Calendar event commands');
  events.command('list')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .option('--from <timeMin>')
    .option('--to <timeMax>')
    .option('--limit <n>', 'Maximum results', '100')
    .option('--query <query>')
    .action((opts) => withErrors(program, async () => {
      const email = await resolveAccount(authManager, program.optsWithGlobals().account);
      const calendar = await calendarFor(authManager, cache, email);
      emit(program, { account: email, items: await calendar.listEvents({ calendarId: opts.calendar, timeMin: opts.from, timeMax: opts.to, maxResults: Number(opts.limit), q: opts.query }) });
    }));
  events.command('upcoming').option('--calendar <id>', 'Calendar ID', 'primary').option('--limit <n>', 'Maximum results', '10').option('--days <n>', 'Days ahead', '7').action((opts) => withErrors(program, async () => {
    const email = await resolveAccount(authManager, program.optsWithGlobals().account);
    const calendar = await calendarFor(authManager, cache, email);
    emit(program, { account: email, items: await calendar.getUpcomingEvents({ calendarId: opts.calendar, maxResults: Number(opts.limit), daysAhead: Number(opts.days) }) });
  }));

  return program;
}
