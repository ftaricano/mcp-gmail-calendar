import { Command } from 'commander';
import { sheets_v4 } from 'googleapis';
import type { CalendarEvent } from '../services/CalendarService.js';
import { ValidationCliError } from './errors.js';
import { buildCalendarEventPayload, buildFreeBusyPayload, ensureCreatableEvent, materializeConferenceRequest } from './calendar-payloads.js';
import {
  type AuthManagerLike,
  type CliServiceFactories,
  type TasksServiceLike,
  type PeopleServiceLike,
  requireKnownAccount,
  resolveAccount,
  switchCurrentAccount,
} from './context.js';
import { buildDraftPayload, buildDraftPayloadPreview, buildMailPayload, buildMailPayloadPreview } from './mail-payloads.js';
import { buildDocsCreatePayload, buildSheetsValuesPayload, collectValues, normalizeDocsExportMimeType, parseContactJson, parseEnumValue, parsePositiveInteger } from './parsers.js';
import {
  type CliRuntime,
  type CreateProgramOptions,
  createCliRuntime,
  installSignalHandlers,
  runAction,
} from './runtime.js';

export type { AuthManagerLike, CliServiceFactories, CreateProgramOptions, TasksServiceLike, PeopleServiceLike };

function globals(program: Command): { account?: string; dryRun?: boolean } {
  return program.optsWithGlobals() as { account?: string; dryRun?: boolean };
}

async function currentAccount(program: Command, runtime: CliRuntime): Promise<string> {
  return resolveAccount(runtime.authManager, globals(program).account, runtime.loadState);
}

function parseSheetId(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ValidationCliError('sheet id must be a non-negative integer.');
  }
  return parsed;
}

function parseBatchRequests(value: string): sheets_v4.Schema$Request[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new ValidationCliError('requests must be valid JSON.', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  if (!Array.isArray(parsed)) {
    throw new ValidationCliError('requests must be a JSON array of Sheets API Request objects.');
  }
  return parsed as sheets_v4.Schema$Request[];
}

async function defaultTimezone(runtime: CliRuntime, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const config = await runtime.loadConfig();
  return typeof config.timezone === 'string' ? config.timezone : 'UTC';
}

function addMailComposeOptions(command: Command): Command {
  return command
    .option('--to <email>', 'Recipient email; comma-separated values are accepted')
    .option('--subject <subject>', 'Message subject')
    .option('--body <text>', 'Plain-text body; use - to read stdin')
    .option('--body-file <path>', 'Read plain-text body from file')
    .option('--html [html]', 'HTML body; pass a value or use with --body to treat body as HTML')
    .option('--html-file <path>', 'Read HTML body from file')
    .option('--cc <email>', 'CC recipients; comma-separated values are accepted')
    .option('--bcc <email>', 'BCC recipients; comma-separated values are accepted')
    .option('--reply-to <email>', 'Reply-To address')
    .option('--attachment <path>', 'Attach file; repeatable', collectValues, [])
    .option('--template-id <id>', 'Stored template id')
    .option('--template-data <json>', 'Template data JSON')
    .option('--template-data-file <path>', 'Template data JSON file')
    .option('--importance <level>', 'Importance: low, normal, high');
}

function addCalendarEventOptions(command: Command): Command {
  return command
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .option('--json <json>', 'Raw event JSON')
    .option('--json-file <path>', 'Raw event JSON file')
    .option('--summary <text>', 'Event summary')
    .option('--description <text>', 'Event description')
    .option('--location <text>', 'Event location')
    .option('--start <datetime>', 'Start datetime')
    .option('--end <datetime>', 'End datetime')
    .option('--attendee <email>', 'Attendee; repeatable and comma-separated values are accepted', collectValues, [])
    .option('--timezone <tz>', 'Event timezone')
    .option('--meet', 'Add Google Meet conference')
    .option('--send-notifications', 'Send attendee notifications');
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const runtime = createCliRuntime(options);
  const program = new Command();

  if (options.installSignalHandlers !== false) installSignalHandlers(runtime);

  program
    .name('gws')
    .description('CLI-first Google Workspace tool with MCP compatibility')
    .version(runtime.version)
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
    .action((opts) => runAction(program, runtime, async () => {
      await runtime.authManager.initialize();
      const accountType = parseEnumValue(opts.type, ['personal', 'workspace'] as const, 'account type');
      const url = await runtime.authManager.authenticate(opts.account, accountType);
      return url ? { account: opts.account, status: 'pending', authUrl: url } : { account: opts.account, status: 'already_authenticated' };
    }));
  auth.command('list').description('List authenticated accounts').action(() => runAction(program, runtime, async () => ({
    accounts: await runtime.authManager.listAccounts(),
    current: (await runtime.loadState()).current,
  })));
  auth.command('current').description('Show current account').action(() => runAction(program, runtime, async () => ({
    account: await currentAccount(program, runtime),
  })));
  auth.command('whoami').description('Alias for auth current').action(() => runAction(program, runtime, async () => ({
    account: await currentAccount(program, runtime),
  })));
  auth.command('switch').description('Set default account').argument('<email>').action((email) => runAction(program, runtime, async () => {
    await requireKnownAccount(runtime.authManager, email);
    await switchCurrentAccount(email, runtime.loadState, runtime.saveState);
    return { current: email };
  }));
  auth.command('logout').description('Remove local account token').argument('<email>').action((email) => runAction(program, runtime, async () => {
    await runtime.authManager.removeAccount(email);
    const state = await runtime.loadState();
    if (state.current === email) await runtime.saveState({});
    return { removed: email };
  }));

  const config = program.command('config').description('Manage gws CLI config');
  config.command('path').description('Show config/state paths').action(() => runAction(program, runtime, async () => ({
    configPath: runtime.configPath(),
    statePath: runtime.statePath(),
  })));
  config.command('list').description('List config values').action(() => runAction(program, runtime, () => runtime.loadConfig()));
  config.command('get').argument('<key>').description('Get a config value').action((key) => runAction(program, runtime, async () => {
    const cfg = await runtime.loadConfig();
    return { [key]: cfg[key] ?? null };
  }));
  config.command('set').argument('<key>').argument('<value>').description('Set a config value').action((key, value) => runAction(program, runtime, async () => {
    const cfg = await runtime.loadConfig();
    cfg[key] = value;
    await runtime.saveConfig(cfg);
    return { [key]: value };
  }));

  const mail = program.command('mail').description('Gmail commands');
  mail.command('profile').description('Show Gmail profile for account').action(() => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, profile: await (await runtime.services.gmail(account)).getAccountInfo() };
  }));
  mail.command('list')
    .option('--query <query>')
    .option('--label <labelId>', 'Filter by label id', collectValues, [])
    .option('--limit <n>', 'Maximum results', '50')
    .option('--page-token <token>')
    .option('--include-spam-trash')
    .action((opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      const result = await (await runtime.services.gmail(account)).listEmails({
        maxResults: parsePositiveInteger(opts.limit, 'limit'),
        pageToken: opts.pageToken,
        query: opts.query,
        labelIds: opts.label,
        includeSpamTrash: Boolean(opts.includeSpamTrash),
      });
      return { account, items: result.emails, nextPageToken: result.nextPageToken };
    }));
  mail.command('search').argument('<query>').option('--limit <n>', 'Maximum results', '50').action((query, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, items: await (await runtime.services.gmail(account)).searchEmails(query, parsePositiveInteger(opts.limit, 'limit')) };
  }));
  mail.command('read').argument('<messageId>').action((messageId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.gmail(account)).getEmailById(messageId);
  }));
  addMailComposeOptions(mail.command('send').description('Send an email')).action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) {
      return { account, dryRun: true, would: { action: 'mail.send', payload: await buildMailPayloadPreview(opts, runtime.readStdin) } };
    }
    const messageId = await (await runtime.services.gmail(account)).sendEmail(await buildMailPayload(opts, runtime.readStdin));
    return { account, messageId };
  }));
  addMailComposeOptions(mail.command('reply').description('Reply to a message').argument('<messageId>')).action((messageId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = await buildMailPayload(opts, runtime.readStdin);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.reply', messageId, payload } };
    return { account, messageId: await (await runtime.services.gmail(account)).replyToEmail(messageId, payload) };
  }));
  addMailComposeOptions(mail.command('forward').description('Forward a message').argument('<messageId>')).action((messageId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = await buildMailPayload(opts, runtime.readStdin);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.forward', messageId, payload } };
    return { account, messageId: await (await runtime.services.gmail(account)).forwardEmail(messageId, payload) };
  }));
  mail.command('delete').description('Move a message to trash').argument('<messageId>').action((messageId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.delete', messageId } };
    await (await runtime.services.gmail(account)).deleteEmail(messageId);
    return { account, deleted: messageId };
  }));
  mail.command('archive').description('Archive a message (remove from inbox)').argument('<messageId>').action((messageId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.archive', messageId } };
    await (await runtime.services.gmail(account)).archiveEmail(messageId);
    return { account, archived: messageId };
  }));
  mail.command('read-status').description('Mark message as read/unread').argument('<messageId>').requiredOption('--status <status>', 'read or unread').action((messageId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const gmail = await runtime.services.gmail(account);
    const status = parseEnumValue(opts.status, ['read', 'unread'] as const, 'status');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: `mail.mark-${status}`, messageId, status } };
    if (status === 'read') await gmail.markAsRead(messageId);
    else await gmail.markAsUnread(messageId);
    return { account, messageId, status };
  }));
  mail.command('mark-read').description('Mark message as read').argument('<messageId>').action((messageId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.mark-read', messageId, status: 'read' } };
    await (await runtime.services.gmail(account)).markAsRead(messageId);
    return { account, messageId, status: 'read' };
  }));
  mail.command('mark-unread').description('Mark message as unread').argument('<messageId>').action((messageId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.mark-unread', messageId, status: 'unread' } };
    await (await runtime.services.gmail(account)).markAsUnread(messageId);
    return { account, messageId, status: 'unread' };
  }));

  const labels = mail.command('labels').description('Manage Gmail labels');
  labels.action(() => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, items: await (await runtime.services.gmail(account)).listLabels() };
  }));
  labels.command('create').argument('<name>').option('--background-color <color>').option('--text-color <color>').action((name, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const labelId = await (await runtime.services.gmail(account)).createLabel(name, { backgroundColor: opts.backgroundColor, textColor: opts.textColor });
    return { account, labelId, name };
  }));
  labels.command('add').argument('<messageId>').argument('<labelId>').action((messageId, labelId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    await (await runtime.services.gmail(account)).addLabel(messageId, labelId);
    return { account, messageId, labelId, added: true };
  }));
  labels.command('remove').argument('<messageId>').argument('<labelId>').action((messageId, labelId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    await (await runtime.services.gmail(account)).removeLabel(messageId, labelId);
    return { account, messageId, labelId, removed: true };
  }));
  const attachmentListAction = (messageId: string) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, messageId, items: await (await runtime.services.gmail(account)).listAttachments(messageId) };
  });
  const attachmentDownloadAction = (messageId: string, attachmentId: string, opts: { output: string }) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.attachments.download', messageId, attachmentId, output: opts.output } };
    return { account, ...(await (await runtime.services.gmail(account)).downloadAttachment(messageId, attachmentId, opts.output)) };
  });
  const attachments = mail.command('attachments').alias('attachment').description('Attachment subcommands');
  attachments.command('list').argument('<messageId>').action(attachmentListAction);
  attachments.command('download').argument('<messageId>').argument('<attachmentId>').requiredOption('--output <path>').action(attachmentDownloadAction);
  mail.command('attachments-list').description('Legacy alias: list message attachments').argument('<messageId>').action(attachmentListAction);
  mail.command('attachment-download').description('Legacy alias: download a message attachment').argument('<messageId>').argument('<attachmentId>').requiredOption('--output <path>').action(attachmentDownloadAction);

  const drafts = mail.command('drafts').description('Manage Gmail drafts');
  drafts.command('list')
    .option('--query <query>')
    .option('--limit <n>', 'Maximum results', '50')
    .option('--page-token <token>')
    .action((opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      const result = await (await runtime.services.gmail(account)).listDrafts({
        maxResults: parsePositiveInteger(opts.limit, 'limit'),
        pageToken: opts.pageToken,
        query: opts.query,
      });
      return { account, items: result.drafts, nextPageToken: result.nextPageToken };
    }));
  drafts.command('get').argument('<draftId>').action((draftId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.gmail(account)).getDraft(draftId);
  }));
  addMailComposeOptions(drafts.command('create').description('Create a draft')).action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) {
      return { account, dryRun: true, would: { action: 'mail.drafts.create', payload: await buildDraftPayloadPreview(opts, runtime.readStdin) } };
    }
    const draftId = await (await runtime.services.gmail(account)).createDraft(await buildDraftPayload(opts, runtime.readStdin));
    return { account, draftId };
  }));
  addMailComposeOptions(drafts.command('update').description('Update a draft').argument('<draftId>')).action((draftId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) {
      return { account, dryRun: true, would: { action: 'mail.drafts.update', draftId, payload: await buildDraftPayloadPreview(opts, runtime.readStdin) } };
    }
    return { account, draftId: await (await runtime.services.gmail(account)).updateDraft(draftId, await buildDraftPayload(opts, runtime.readStdin)) };
  }));
  drafts.command('send').argument('<draftId>').action((draftId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.drafts.send', draftId } };
    return { account, messageId: await (await runtime.services.gmail(account)).sendDraft(draftId) };
  }));
  drafts.command('delete').argument('<draftId>').action((draftId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.drafts.delete', draftId } };
    await (await runtime.services.gmail(account)).deleteDraft(draftId);
    return { account, deleted: draftId };
  }));

  const threads = mail.command('threads').description('Manage Gmail threads');
  threads.command('list')
    .option('--query <query>')
    .option('--label <labelId>', 'Filter by label id; repeatable', collectValues, [])
    .option('--limit <n>', 'Maximum results', '50')
    .option('--page-token <token>')
    .action((opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      const result = await (await runtime.services.gmail(account)).listThreads({
        maxResults: parsePositiveInteger(opts.limit, 'limit'),
        pageToken: opts.pageToken,
        query: opts.query,
        labelIds: opts.label?.length ? opts.label : undefined,
      });
      return { account, items: result.threads, nextPageToken: result.nextPageToken };
    }));
  threads.command('get').argument('<threadId>').action((threadId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.gmail(account)).getThread(threadId);
  }));
  threads.command('modify').argument('<threadId>')
    .option('--add-label <id>', 'Label id to add; repeatable', collectValues, [])
    .option('--remove-label <id>', 'Label id to remove; repeatable', collectValues, [])
    .action((threadId, opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      const addLabelIds = opts.addLabel?.length ? opts.addLabel : undefined;
      const removeLabelIds = opts.removeLabel?.length ? opts.removeLabel : undefined;
      if (!addLabelIds && !removeLabelIds) {
        throw new ValidationCliError('Provide at least one --add-label or --remove-label.');
      }
      if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.threads.modify', threadId, addLabelIds, removeLabelIds } };
      return { account, thread: await (await runtime.services.gmail(account)).modifyThread(threadId, { addLabelIds, removeLabelIds }) };
    }));
  threads.command('trash').argument('<threadId>').action((threadId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'mail.threads.trash', threadId } };
    await (await runtime.services.gmail(account)).trashThread(threadId);
    return { account, trashed: threadId };
  }));

  const cal = program.command('cal').alias('calendar').description('Google Calendar commands');
  const calendars = cal.command('calendars').description('List and manage calendars');
  calendars.action(() => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, items: await (await runtime.services.calendar(account)).listCalendars() };
  }));
  calendars.command('create')
    .description('Create a secondary calendar')
    .requiredOption('--summary <s>', 'Calendar title')
    .option('--description <d>', 'Calendar description')
    .option('--timezone <tz>', 'Calendar time zone (IANA)')
    .action((opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      const payload = { summary: opts.summary, description: opts.description, timeZone: opts.timezone };
      if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.calendars.create', payload } };
      return { account, calendar: await (await runtime.services.calendar(account)).createCalendar(payload.summary, { description: payload.description, timeZone: payload.timeZone }) };
    }));
  calendars.command('delete')
    .description('Delete a secondary calendar (destructive)')
    .argument('<calendarId>')
    .action((calendarId) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.calendars.delete', calendarId } };
      await (await runtime.services.calendar(account)).deleteCalendar(calendarId);
      return { account, deleted: calendarId };
    }));
  cal.command('freebusy')
    .requiredOption('--from <timeMin>')
    .requiredOption('--to <timeMax>')
    .option('--calendar <id>', 'Calendar ID; repeatable', collectValues, [])
    .option('--timezone <tz>')
    .action((opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      const query = buildFreeBusyPayload(opts.from, opts.to, opts.calendar, await defaultTimezone(runtime, opts.timezone));
      return { account, freeBusy: await (await runtime.services.calendar(account)).getFreeBusy(query) };
    }));
  const events = cal.command('events').description('Calendar event commands');
  events.command('list')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .option('--from <timeMin>')
    .option('--to <timeMax>')
    .option('--limit <n>', 'Maximum results', '100')
    .option('--query <query>')
    .action((opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      return { account, items: await (await runtime.services.calendar(account)).listEvents({ calendarId: opts.calendar, timeMin: opts.from, timeMax: opts.to, maxResults: parsePositiveInteger(opts.limit, 'limit'), q: opts.query }) };
    }));
  events.command('upcoming').option('--calendar <id>', 'Calendar ID', 'primary').option('--limit <n>', 'Maximum results', '10').option('--days <n>', 'Days ahead', '7').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, items: await (await runtime.services.calendar(account)).getUpcomingEvents({ calendarId: opts.calendar, maxResults: parsePositiveInteger(opts.limit, 'limit'), daysAhead: parsePositiveInteger(opts.days, 'days') }) };
  }));
  events.command('search').argument('<query>').option('--calendar <id>', 'Calendar ID', 'primary').option('--limit <n>', 'Maximum results', '50').action((query, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, items: await (await runtime.services.calendar(account)).searchEvents(query, { calendarId: opts.calendar, maxResults: parsePositiveInteger(opts.limit, 'limit') }) };
  }));
  events.command('get').argument('<eventId>').option('--calendar <id>', 'Calendar ID', 'primary').action((eventId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.calendar(account)).getEvent(opts.calendar, eventId);
  }));
  events.command('instances')
    .description('List instances (occurrences) of a recurring event')
    .argument('<eventId>')
    .option('--calendar <id>', 'Calendar ID', 'primary')
    .option('--from <timeMin>')
    .option('--to <timeMax>')
    .option('--limit <n>', 'Maximum results')
    .action((eventId, opts) => runAction(program, runtime, async () => {
      const account = await currentAccount(program, runtime);
      return { account, items: await (await runtime.services.calendar(account)).getEventInstances(opts.calendar, eventId, {
        timeMin: opts.from,
        timeMax: opts.to,
        maxResults: opts.limit !== undefined ? parsePositiveInteger(opts.limit, 'limit') : undefined,
      }) };
    }));
  addCalendarEventOptions(events.command('create').description('Create calendar event')).action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = await buildCalendarEventPayload(opts, await defaultTimezone(runtime, opts.timezone), runtime.readStdin);
    ensureCreatableEvent(payload);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.events.create', calendarId: opts.calendar, payload } };
    const conferenceData = materializeConferenceRequest(payload.conferenceData, runtime.now);
    const event = conferenceData ? { ...payload, conferenceData } : payload;
    return { account, event: await (await runtime.services.calendar(account)).createEvent(event, opts.calendar, Boolean(opts.sendNotifications)) };
  }));
  addCalendarEventOptions(events.command('update').description('Update calendar event').argument('<eventId>')).action((eventId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = await buildCalendarEventPayload(opts, await defaultTimezone(runtime, opts.timezone), runtime.readStdin) as Partial<CalendarEvent>;
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.events.update', calendarId: opts.calendar, eventId, payload } };
    return { account, event: await (await runtime.services.calendar(account)).updateEvent(opts.calendar, eventId, payload, Boolean(opts.sendNotifications)) };
  }));
  events.command('delete').argument('<eventId>').option('--calendar <id>', 'Calendar ID', 'primary').option('--send-notifications').action((eventId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.events.delete', calendarId: opts.calendar, eventId } };
    await (await runtime.services.calendar(account)).deleteEvent(opts.calendar, eventId, Boolean(opts.sendNotifications));
    return { account, deleted: eventId };
  }));
  events.command('quickadd').argument('<text>').option('--calendar <id>', 'Calendar ID', 'primary').action((text, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.events.quickadd', calendarId: opts.calendar, text } };
    return { account, event: await (await runtime.services.calendar(account)).quickAddEvent(opts.calendar, text) };
  }));
  events.command('respond').argument('<eventId>').requiredOption('--response <response>', 'accepted, declined, tentative, needsAction').option('--calendar <id>', 'Calendar ID', 'primary').option('--comment <text>').action((eventId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const response = parseEnumValue(opts.response, ['accepted', 'declined', 'tentative', 'needsAction'] as const, 'response');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.events.respond', calendarId: opts.calendar, eventId, response, comment: opts.comment } };
    return { account, event: await (await runtime.services.calendar(account)).respondToInvitation(opts.calendar, eventId, response, opts.comment) };
  }));
  events.command('conference').description('Add Google Meet conference to an event').argument('<eventId>').option('--calendar <id>', 'Calendar ID', 'primary').option('--type <type>', 'hangoutsMeet or addOn', 'hangoutsMeet').action((eventId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const type = parseEnumValue(opts.type, ['hangoutsMeet', 'addOn'] as const, 'conference type');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'calendar.events.conference', calendarId: opts.calendar, eventId, type } };
    return { account, event: await (await runtime.services.calendar(account)).addConferenceToEvent(opts.calendar, eventId, type) };
  }));

  const drive = program.command('drive').description('Google Drive commands');
  drive.command('list').option('--query <query>').option('--limit <n>', 'Maximum results', '50').option('--page-token <token>').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, items: await (await runtime.services.drive(account)).listFiles({ query: opts.query, pageSize: parsePositiveInteger(opts.limit, 'limit'), pageToken: opts.pageToken }) };
  }));
  drive.command('get').argument('<fileId>').action((fileId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.drive(account)).getFile(fileId);
  }));
  drive.command('upload').requiredOption('--path <path>').option('--name <name>').option('--mime-type <type>').option('--parent <id>', 'Parent folder id; repeatable', collectValues, []).action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = { path: opts.path, name: opts.name, mimeType: opts.mimeType, parents: opts.parent?.length ? opts.parent : undefined };
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.upload', payload } };
    return { account, file: await (await runtime.services.drive(account)).uploadFile(payload) };
  }));
  drive.command('download').argument('<fileId>').requiredOption('--output <path>').action((fileId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, ...(await (await runtime.services.drive(account)).downloadFile(fileId, opts.output)) };
  }));
  drive.command('mkdir').argument('<name>').option('--parent <id>').action((name, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.mkdir', name, parent: opts.parent } };
    return { account, folder: await (await runtime.services.drive(account)).createFolder(name, opts.parent) };
  }));
  drive.command('share').argument('<fileId>').requiredOption('--role <role>').option('--email <email>').option('--type <type>', 'user, group, domain, anyone', 'user').action((fileId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const role = parseEnumValue(opts.role, ['reader', 'commenter', 'writer'] as const, 'role');
    const type = parseEnumValue(opts.type, ['user', 'group', 'domain', 'anyone'] as const, 'type');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.share', fileId, role, email: opts.email, type } };
    return { account, permission: await (await runtime.services.drive(account)).shareFile(fileId, role, opts.email, type) };
  }));
  drive.command('trash').argument('<fileId>').action((fileId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.trash', fileId } };
    return { account, file: await (await runtime.services.drive(account)).trashFile(fileId) };
  }));
  drive.command('restore').argument('<fileId>').action((fileId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.restore', fileId } };
    return { account, file: await (await runtime.services.drive(account)).restoreFile(fileId) };
  }));
  drive.command('copy').argument('<fileId>').option('--name <name>').option('--parent <id>', 'Parent folder id; repeatable', collectValues, []).action((fileId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const parents = opts.parent?.length ? opts.parent : undefined;
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.copy', fileId, name: opts.name, parents } };
    return { account, file: await (await runtime.services.drive(account)).copyFile(fileId, { name: opts.name, parents }) };
  }));
  drive.command('batch-delete').description('Move multiple files to the trash (recoverable)').argument('<fileIds...>').action((fileIds) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.batch-delete', fileIds } };
    return { account, results: await (await runtime.services.drive(account)).batchDelete(fileIds) };
  }));
  drive.command('revisions').argument('<fileId>').action((fileId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, fileId, items: await (await runtime.services.drive(account)).listRevisions(fileId) };
  }));
  drive.command('shared-drives').description('List shared drives').option('--limit <n>', 'Maximum results', '50').option('--page-token <token>').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const result = await (await runtime.services.drive(account)).listSharedDrives({ pageSize: parsePositiveInteger(opts.limit, 'limit'), pageToken: opts.pageToken });
    return { account, items: result.drives, nextPageToken: result.nextPageToken };
  }));
  drive.command('shortcut').argument('<targetId>').requiredOption('--name <name>').option('--parent <id>', 'Parent folder id; repeatable', collectValues, []).action((targetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const parents = opts.parent?.length ? opts.parent : undefined;
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'drive.shortcut', targetId, name: opts.name, parents } };
    return { account, file: await (await runtime.services.drive(account)).createShortcut(targetId, opts.name, { parents }) };
  }));

  const docs = program.command('docs').description('Google Docs commands');
  docs.command('get').argument('<documentId>').action((documentId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.docs(account)).getDocument(documentId);
  }));
  docs.command('create').requiredOption('--title <title>').option('--content <text>').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = buildDocsCreatePayload(opts.title, opts.content);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'docs.create', payload } };
    return { account, document: await (await runtime.services.docs(account)).createDocument(payload.title, payload.content) };
  }));
  docs.command('export').argument('<documentId>').requiredOption('--output <path>').option('--mime-type <type>', 'Export MIME type or alias', 'pdf').action((documentId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, ...(await (await runtime.services.docs(account)).exportDocument(documentId, normalizeDocsExportMimeType(opts.mimeType), opts.output)) };
  }));
  docs.command('insert-text').argument('<documentId>').requiredOption('--text <text>').option('--index <n>', 'Insertion index', '1').action((documentId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const index = parsePositiveInteger(opts.index, 'index');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'docs.insert-text', documentId, text: opts.text, index } };
    return { account, result: await (await runtime.services.docs(account)).insertText(documentId, opts.text, index) };
  }));
  docs.command('replace-text').argument('<documentId>').requiredOption('--find <find>').requiredOption('--replace <replace>').option('--match-case').action((documentId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const replacements = [{ find: opts.find, replace: opts.replace, matchCase: Boolean(opts.matchCase) }];
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'docs.replace-text', documentId, replacements } };
    return { account, result: await (await runtime.services.docs(account)).replaceAllText(documentId, replacements) };
  }));
  docs.command('insert-table').argument('<documentId>').requiredOption('--rows <n>').requiredOption('--columns <n>').option('--index <n>', 'Insertion index', '1').action((documentId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const rows = parsePositiveInteger(opts.rows, 'rows');
    const columns = parsePositiveInteger(opts.columns, 'columns');
    const index = parsePositiveInteger(opts.index, 'index');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'docs.insert-table', documentId, rows, columns, index } };
    return { account, result: await (await runtime.services.docs(account)).insertTable(documentId, rows, columns, index) };
  }));
  docs.command('insert-image').argument('<documentId>').requiredOption('--uri <url>').option('--index <n>', 'Insertion index', '1').action((documentId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const index = parsePositiveInteger(opts.index, 'index');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'docs.insert-image', documentId, uri: opts.uri, index } };
    return { account, result: await (await runtime.services.docs(account)).insertImage(documentId, opts.uri, index) };
  }));
  docs.command('batch-update').argument('<documentId>').requiredOption('--requests <json>', 'Raw batchUpdate requests array JSON').action((documentId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    let requests: unknown;
    try {
      requests = JSON.parse(opts.requests);
    } catch {
      throw new TypeError('--requests must be valid JSON (a batchUpdate requests array)');
    }
    if (!Array.isArray(requests)) throw new TypeError('--requests must be a JSON array');
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'docs.batch-update', documentId, requests } };
    return { account, result: await (await runtime.services.docs(account)).batchUpdate(documentId, requests) };
  }));

  const sheets = program.command('sheets').description('Google Sheets commands');
  sheets.command('get').argument('<spreadsheetId>').action((spreadsheetId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return await (await runtime.services.sheets(account)).getSpreadsheet(spreadsheetId);
  }));
  sheets.command('values').argument('<spreadsheetId>').requiredOption('--range <range>').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, values: await (await runtime.services.sheets(account)).getValues(spreadsheetId, opts.range) };
  }));
  sheets.command('update').argument('<spreadsheetId>').requiredOption('--range <range>').requiredOption('--values <json>').option('--value-input-option <mode>', 'RAW or USER_ENTERED', 'RAW').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const valueInputOption = parseEnumValue(opts.valueInputOption, ['RAW', 'USER_ENTERED'] as const, 'value input option');
    const payload = buildSheetsValuesPayload(JSON.parse(opts.values), valueInputOption);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.update', spreadsheetId, range: opts.range, payload } };
    return { account, result: await (await runtime.services.sheets(account)).updateValues(spreadsheetId, opts.range, payload.values, payload.valueInputOption) };
  }));
  sheets.command('append').argument('<spreadsheetId>').requiredOption('--range <range>').requiredOption('--values <json>').option('--value-input-option <mode>', 'RAW or USER_ENTERED', 'RAW').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const valueInputOption = parseEnumValue(opts.valueInputOption, ['RAW', 'USER_ENTERED'] as const, 'value input option');
    const payload = buildSheetsValuesPayload(JSON.parse(opts.values), valueInputOption);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.append', spreadsheetId, range: opts.range, payload } };
    return { account, result: await (await runtime.services.sheets(account)).appendValues(spreadsheetId, opts.range, payload.values, payload.valueInputOption) };
  }));
  sheets.command('add-sheet').argument('<spreadsheetId>').requiredOption('--title <title>').option('--rows <n>').option('--columns <n>').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const rows = opts.rows !== undefined ? parsePositiveInteger(opts.rows, 'rows') : undefined;
    const columns = opts.columns !== undefined ? parsePositiveInteger(opts.columns, 'columns') : undefined;
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.addSheet', spreadsheetId, title: opts.title, rows, columns } };
    return { account, result: await (await runtime.services.sheets(account)).addSheet(spreadsheetId, opts.title, { rows, columns }) };
  }));
  sheets.command('delete-sheet').argument('<spreadsheetId>').requiredOption('--sheet-id <n>').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const sheetId = parseSheetId(opts.sheetId);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.deleteSheet', spreadsheetId, sheetId } };
    return { account, result: await (await runtime.services.sheets(account)).deleteSheet(spreadsheetId, sheetId) };
  }));
  sheets.command('rename-sheet').argument('<spreadsheetId>').requiredOption('--sheet-id <n>').requiredOption('--title <title>').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const sheetId = parseSheetId(opts.sheetId);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.renameSheet', spreadsheetId, sheetId, title: opts.title } };
    return { account, result: await (await runtime.services.sheets(account)).renameSheet(spreadsheetId, sheetId, opts.title) };
  }));
  sheets.command('clear').argument('<spreadsheetId>').requiredOption('--range <range>').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.clear', spreadsheetId, range: opts.range } };
    return { account, result: await (await runtime.services.sheets(account)).clearValues(spreadsheetId, opts.range) };
  }));
  sheets.command('batch-update').argument('<spreadsheetId>').requiredOption('--requests <json>').action((spreadsheetId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const requests = parseBatchRequests(opts.requests);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'sheets.batchUpdate', spreadsheetId, requests } };
    return { account, result: await (await runtime.services.sheets(account)).batchUpdate(spreadsheetId, requests) };
  }));

  const tasks = program.command('tasks').description('Google Tasks commands');
  const taskLists = tasks.command('lists').description('Manage task lists');
  taskLists.command('list').description('List task lists').option('--limit <n>', 'Maximum results').option('--page-token <token>').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.tasks(account)).listTaskLists({ maxResults: opts.limit ? parsePositiveInteger(opts.limit, 'limit') : undefined, pageToken: opts.pageToken }) };
  }));
  taskLists.command('get').argument('<id>').description('Get a task list').action((id) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.tasks(account)).getTaskList(id) };
  }));
  taskLists.command('create').requiredOption('--title <title>').description('Create a task list').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.lists.create', title: opts.title } };
    return { account, result: await (await runtime.services.tasks(account)).createTaskList(opts.title) };
  }));
  taskLists.command('update').argument('<id>').requiredOption('--title <title>').description('Update a task list title').action((id, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.lists.update', tasklistId: id, title: opts.title } };
    return { account, result: await (await runtime.services.tasks(account)).updateTaskList(id, opts.title) };
  }));
  taskLists.command('delete').argument('<id>').description('Delete a task list').action((id) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.lists.delete', tasklistId: id } };
    await (await runtime.services.tasks(account)).deleteTaskList(id);
    return { account, deleted: id };
  }));
  tasks.command('list').argument('<tasklistId>').description('List tasks in a list').option('--show-completed').option('--limit <n>', 'Maximum results').action((tasklistId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.tasks(account)).listTasks(tasklistId, { showCompleted: Boolean(opts.showCompleted), maxResults: opts.limit ? parsePositiveInteger(opts.limit, 'limit') : undefined }) };
  }));
  tasks.command('get').argument('<tasklistId>').argument('<taskId>').description('Get a task').action((tasklistId, taskId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.tasks(account)).getTask(tasklistId, taskId) };
  }));
  tasks.command('create').argument('<tasklistId>').requiredOption('--title <title>').option('--notes <notes>').option('--due <iso>').description('Create a task').action((tasklistId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const payload = { title: opts.title, notes: opts.notes, due: opts.due };
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.create', tasklistId, payload } };
    return { account, result: await (await runtime.services.tasks(account)).createTask(tasklistId, payload) };
  }));
  tasks.command('update').argument('<tasklistId>').argument('<taskId>').option('--title <title>').option('--notes <notes>').option('--due <iso>').option('--status <status>', 'needsAction or completed').description('Update a task').action((tasklistId, taskId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const status = opts.status ? parseEnumValue(opts.status, ['needsAction', 'completed'] as const, 'status') : undefined;
    const fields = { title: opts.title, notes: opts.notes, due: opts.due, status };
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.update', tasklistId, taskId, fields } };
    return { account, result: await (await runtime.services.tasks(account)).updateTask(tasklistId, taskId, fields) };
  }));
  tasks.command('complete').argument('<tasklistId>').argument('<taskId>').description('Mark a task completed').action((tasklistId, taskId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.complete', tasklistId, taskId } };
    return { account, result: await (await runtime.services.tasks(account)).completeTask(tasklistId, taskId) };
  }));
  tasks.command('move').argument('<tasklistId>').argument('<taskId>').option('--parent <id>').option('--previous <id>').description('Move a task').action((tasklistId, taskId, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.move', tasklistId, taskId, parent: opts.parent, previous: opts.previous } };
    return { account, result: await (await runtime.services.tasks(account)).moveTask(tasklistId, taskId, { parent: opts.parent, previous: opts.previous }) };
  }));
  tasks.command('delete').argument('<tasklistId>').argument('<taskId>').description('Delete a task').action((tasklistId, taskId) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'tasks.delete', tasklistId, taskId } };
    await (await runtime.services.tasks(account)).deleteTask(tasklistId, taskId);
    return { account, deleted: taskId };
  }));

  const contacts = program.command('contacts').description('Google People / Contacts commands');
  contacts.command('list').description('List contacts').option('--page-size <n>', 'Maximum results').option('--page-token <token>').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.people(account)).listContacts({ pageSize: opts.pageSize ? parsePositiveInteger(opts.pageSize, 'page size') : undefined, pageToken: opts.pageToken }) };
  }));
  contacts.command('search').argument('<query>').description('Search contacts').option('--page-size <n>', 'Maximum results').action((query, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.people(account)).searchContacts(query, { pageSize: opts.pageSize ? parsePositiveInteger(opts.pageSize, 'page size') : undefined }) };
  }));
  contacts.command('get').argument('<resourceName>').description('Get a contact').action((resourceName) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.people(account)).getContact(resourceName) };
  }));
  contacts.command('create').requiredOption('--json <json>', 'Person resource JSON').description('Create a contact').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const person = parseContactJson(opts.json);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'contacts.create', person } };
    return { account, result: await (await runtime.services.people(account)).createContact(person) };
  }));
  contacts.command('update').argument('<resourceName>').requiredOption('--json <json>', 'Person resource JSON').requiredOption('--fields <fields>', 'Comma-separated updatePersonFields').description('Update a contact').action((resourceName, opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    const person = parseContactJson(opts.json);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'contacts.update', resourceName, updatePersonFields: opts.fields, person } };
    return { account, result: await (await runtime.services.people(account)).updateContact(resourceName, person, opts.fields) };
  }));
  contacts.command('delete').argument('<resourceName>').description('Delete a contact').action((resourceName) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    if (globals(program).dryRun) return { account, dryRun: true, would: { action: 'contacts.delete', resourceName } };
    await (await runtime.services.people(account)).deleteContact(resourceName);
    return { account, deleted: resourceName };
  }));
  const contactGroups = contacts.command('groups').description('Manage contact groups');
  contactGroups.command('list').description('List contact groups').option('--page-size <n>', 'Maximum results').option('--page-token <token>').action((opts) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.people(account)).listContactGroups({ pageSize: opts.pageSize ? parsePositiveInteger(opts.pageSize, 'page size') : undefined, pageToken: opts.pageToken }) };
  }));
  contactGroups.command('get').argument('<resourceName>').description('Get a contact group').action((resourceName) => runAction(program, runtime, async () => {
    const account = await currentAccount(program, runtime);
    return { account, result: await (await runtime.services.people(account)).getContactGroup(resourceName) };
  }));

  program.command('doctor').description('Check local gws configuration').action(() => runAction(program, runtime, async () => ({
    version: runtime.version,
    configPath: runtime.configPath(),
    statePath: runtime.statePath(),
    accounts: await runtime.authManager.listAccounts(),
    current: (await runtime.loadState()).current ?? null,
  })));

  return program;
}
