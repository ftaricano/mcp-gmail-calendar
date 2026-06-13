import type { Command } from 'commander';
import type {
  AuthManagerLike,
  CalendarServiceLike,
  CliServiceFactories,
  CreateProgramOptions,
  DocsServiceLike,
  DriveServiceLike,
  GmailServiceLike,
  SheetsServiceLike,
} from '../src/cli/program.js';

type WriteResult = boolean;

export class MemoryWriter {
  public readonly chunks: string[] = [];
  public isTTY = false;

  write(chunk: string | Uint8Array): WriteResult {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }

  toString(): string {
    return this.chunks.join('');
  }
}

export interface FakeRuntimeOptions {
  authManager?: Partial<AuthManagerLike>;
  services?: Partial<CliServiceFactories>;
  readStdin?: () => Promise<string>;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  version?: string;
}

export function createFakeAuthManager(overrides: Partial<AuthManagerLike> = {}): AuthManagerLike {
  return {
    initialize: async () => undefined,
    authenticate: async () => null,
    listAccounts: async () => [{ email: 'me@example.com' }],
    removeAccount: async () => undefined,
    getAuthClient: async () => null,
    cleanupAuthServers: () => undefined,
    ...overrides,
  };
}

export function createFakeServices(
  overrides: Partial<CliServiceFactories> = {},
): CliServiceFactories {
  const gmail: GmailServiceLike = {
    getAccountInfo: async () => ({ email: 'me@example.com', messagesTotal: 1 }),
    listLabels: async () => [{ id: 'INBOX', name: 'Inbox' }],
    listEmails: async () => ({ emails: [], nextPageToken: undefined }),
    searchEmails: async () => [],
    getEmailById: async (messageId: string) => ({ id: messageId, subject: 'Hello' }),
    sendEmail: async () => 'msg-1',
    replyToEmail: async () => 'reply-1',
    forwardEmail: async () => 'fwd-1',
    deleteEmail: async () => undefined,
    markAsRead: async () => undefined,
    markAsUnread: async () => undefined,
    createLabel: async () => 'label-1',
    addLabel: async () => undefined,
    removeLabel: async () => undefined,
    listAttachments: async () => [{ id: 'att-1', filename: 'file.txt', mimeType: 'text/plain', size: 12 }],
    downloadAttachment: async () => ({ path: '/tmp/file.txt', filename: 'file.txt', size: 12 }),
  };

  const calendar: CalendarServiceLike = {
    listCalendars: async () => [],
    listEvents: async () => [],
    getUpcomingEvents: async () => [],
    getEvent: async (_calendarId: string, eventId: string) => ({ id: eventId, summary: 'Meeting', start: {}, end: {} }),
    createEvent: async (event) => event,
    updateEvent: async (_calendarId: string, eventId: string, updates) => ({ id: eventId, summary: 'Updated', start: {}, end: {}, ...updates }),
    deleteEvent: async () => undefined,
    getFreeBusy: async (query) => ({ ...query, calendars: {} }),
    respondToInvitation: async (_calendarId: string, eventId: string, response) => ({ id: eventId, summary: response, start: {}, end: {} }),
    quickAddEvent: async (_calendarId: string, text: string) => ({ summary: text, start: {}, end: {} }),
    searchEvents: async () => [],
    addConferenceToEvent: async (_calendarId: string, eventId: string) => ({ id: eventId, summary: 'Conference', start: {}, end: {} }),
  };

  const drive: DriveServiceLike = {
    listFiles: async () => [],
    getFile: async (fileId: string) => ({ id: fileId, name: 'File' }),
    uploadFile: async (input) => ({ id: 'file-1', name: input.name }),
    downloadFile: async (_fileId: string, outputPath: string) => ({ path: outputPath, size: 10 }),
    createFolder: async (name: string) => ({ id: 'folder-1', name }),
    shareFile: async (fileId: string, role: string, emailAddress?: string) => ({ id: fileId, role, emailAddress }),
  };

  const docs: DocsServiceLike = {
    getDocument: async (documentId: string) => ({ documentId, title: 'Doc' }),
    exportDocument: async (_documentId: string, mimeType: string, outputPath?: string) => ({
      mimeType,
      path: outputPath ?? '/tmp/doc.out',
      size: 10,
    }),
    createDocument: async (title: string, content?: string) => ({ documentId: 'doc-1', title, content }),
  };

  const sheets: SheetsServiceLike = {
    getSpreadsheet: async (spreadsheetId: string) => ({ spreadsheetId, properties: { title: 'Sheet' } }),
    getValues: async (_spreadsheetId: string, range: string) => ({ range, values: [['a']] }),
    updateValues: async (_spreadsheetId: string, range: string, values) => ({ range, values, updatedCells: values.flat().length }),
    appendValues: async (_spreadsheetId: string, range: string, values) => ({ range, values, updates: { updatedRows: values.length } }),
  };

  return {
    gmail: async () => gmail,
    calendar: async () => calendar,
    drive: async () => drive,
    docs: async () => docs,
    sheets: async () => sheets,
    ...overrides,
  };
}

export function createProgramOptions(options: FakeRuntimeOptions = {}): CreateProgramOptions & {
  stdout: MemoryWriter;
  stderr: MemoryWriter;
} {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const authManager = createFakeAuthManager(options.authManager);
  const services = createFakeServices(options.services);

  return {
    authManager,
    services,
    stdout,
    stderr,
    readStdin: options.readStdin ?? (async () => ''),
    loadConfig: async () => options.config ?? {},
    saveConfig: async () => undefined,
    loadState: async () => options.state ?? {},
    saveState: async () => undefined,
    installSignalHandlers: false,
    version: options.version ?? '9.9.9-test',
  };
}

export async function runCli(
  createProgram: (options?: CreateProgramOptions) => Command,
  argv: string[],
  options: FakeRuntimeOptions = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const originalExitCode = process.exitCode;
  process.exitCode = 0;
  const programOptions = createProgramOptions(options);
  const program = createProgram(programOptions);
  await program.parseAsync(['node', 'gws', ...argv]);
  const result = {
    stdout: programOptions.stdout.toString(),
    stderr: programOptions.stderr.toString(),
    exitCode: process.exitCode ?? 0,
  };
  process.exitCode = originalExitCode;
  return result;
}
