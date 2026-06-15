import { OAuth2Client } from 'google-auth-library';
import { GoogleAuthManager } from '../auth/GoogleAuthManager.js';
import { CacheManager } from '../utils/CacheManager.js';
import { type AttachmentInfo, GmailService, type SendEmailOptions } from '../services/GmailService.js';
import { CalendarService, type CalendarEvent, type FreeBusyQuery } from '../services/CalendarService.js';
import { DriveService, type DriveFileRecord, type DriveListOptions, type DriveUploadOptions, type DriveDownloadResult } from '../services/DriveService.js';
import { DocsService } from '../services/DocsService.js';
import { SheetsService } from '../services/SheetsService.js';
import {
  type CreateTaskInput,
  type ListTasksOptions,
  type MoveTaskOptions,
  type UpdateTaskFields,
  TasksService,
} from '../services/TasksService.js';
import {
  type ListContactsOptions,
  type ListContactGroupsOptions,
  type SearchContactsOptions,
  PeopleService,
} from '../services/PeopleService.js';
import { AuthCliError, NotFoundCliError } from './errors.js';
import { loadState, saveState } from './config.js';

export interface CliGlobals {
  account?: string;
  format?: string;
  quiet?: boolean;
  dryRun?: boolean;
}

export interface AuthManagerLike {
  initialize(): Promise<void>;
  authenticate(email: string, accountType: 'personal' | 'workspace'): Promise<string | null>;
  listAccounts(): Promise<Array<{ email: string }>>;
  removeAccount(email: string): Promise<void>;
  getAuthClient(email: string): Promise<OAuth2Client | null>;
  cleanupAuthServers(): void;
}

export interface GmailServiceLike {
  getAccountInfo(): Promise<unknown>;
  listLabels(): Promise<any[]>;
  listEmails(options?: unknown): Promise<{ emails: unknown[]; nextPageToken?: string }>;
  searchEmails(query: string, maxResults?: number): Promise<unknown[]>;
  getEmailById(messageId: string): Promise<unknown>;
  sendEmail(options: SendEmailOptions): Promise<string>;
  replyToEmail(messageId: string, options: Omit<SendEmailOptions, 'to'>): Promise<string>;
  forwardEmail(messageId: string, options: SendEmailOptions): Promise<string>;
  deleteEmail(messageId: string): Promise<void>;
  markAsRead(messageId: string): Promise<void>;
  markAsUnread(messageId: string): Promise<void>;
  createLabel(name: string, options?: { backgroundColor?: string; textColor?: string }): Promise<string>;
  addLabel(messageId: string, labelId: string): Promise<void>;
  removeLabel(messageId: string, labelId: string): Promise<void>;
  listAttachments(messageId: string): Promise<AttachmentInfo[]>;
  downloadAttachment(
    messageId: string,
    attachmentId: string,
    savePath: string,
  ): Promise<{ path: string; filename?: string; size: number }>;
}

export interface CalendarServiceLike {
  listCalendars(): Promise<any[]>;
  listEvents(options?: unknown): Promise<CalendarEvent[]>;
  getUpcomingEvents(options?: unknown): Promise<CalendarEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  createEvent(event: CalendarEvent, calendarId?: string, sendNotifications?: boolean): Promise<CalendarEvent>;
  updateEvent(
    calendarId: string,
    eventId: string,
    updates: Partial<CalendarEvent>,
    sendNotifications?: boolean,
  ): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string, sendNotifications?: boolean): Promise<void>;
  getFreeBusy(query: FreeBusyQuery): Promise<unknown>;
  respondToInvitation(
    calendarId: string,
    eventId: string,
    response: 'accepted' | 'declined' | 'tentative' | 'needsAction',
    comment?: string,
  ): Promise<CalendarEvent>;
  quickAddEvent(calendarId: string, text: string): Promise<CalendarEvent>;
  searchEvents(query: string, options?: unknown): Promise<CalendarEvent[]>;
  addConferenceToEvent(
    calendarId: string,
    eventId: string,
    conferenceType: 'hangoutsMeet' | 'addOn',
  ): Promise<CalendarEvent>;
}

export interface DriveServiceLike {
  listFiles(options?: DriveListOptions): Promise<DriveFileRecord[]>;
  getFile(fileId: string): Promise<DriveFileRecord>;
  uploadFile(options: DriveUploadOptions): Promise<DriveFileRecord>;
  downloadFile(fileId: string, outputPath: string): Promise<DriveDownloadResult>;
  createFolder(name: string, parentId?: string): Promise<DriveFileRecord>;
  shareFile(
    fileId: string,
    role: 'reader' | 'commenter' | 'writer',
    emailAddress?: string,
    type?: 'user' | 'group' | 'domain' | 'anyone',
  ): Promise<{ id?: string; role: string; emailAddress?: string; type: string }>;
}

export interface DocsServiceLike {
  getDocument(documentId: string): Promise<unknown>;
  exportDocument(documentId: string, mimeType: string, outputPath: string): Promise<{ path: string; mimeType: string; size: number }>;
  createDocument(title: string, content?: string): Promise<unknown>;
}

export interface SheetsServiceLike {
  getSpreadsheet(spreadsheetId: string): Promise<unknown>;
  getValues(spreadsheetId: string, range: string): Promise<unknown>;
  updateValues(
    spreadsheetId: string,
    range: string,
    values: string[][],
    valueInputOption?: 'RAW' | 'USER_ENTERED',
  ): Promise<unknown>;
  appendValues(
    spreadsheetId: string,
    range: string,
    values: string[][],
    valueInputOption?: 'RAW' | 'USER_ENTERED',
  ): Promise<unknown>;
}

export interface TasksServiceLike {
  listTaskLists(opts?: { maxResults?: number; pageToken?: string }): Promise<unknown>;
  getTaskList(tasklistId: string): Promise<unknown>;
  createTaskList(title: string): Promise<unknown>;
  updateTaskList(tasklistId: string, title: string): Promise<unknown>;
  deleteTaskList(tasklistId: string): Promise<void>;
  listTasks(tasklistId: string, opts?: ListTasksOptions): Promise<unknown>;
  getTask(tasklistId: string, taskId: string): Promise<unknown>;
  createTask(tasklistId: string, input: CreateTaskInput): Promise<unknown>;
  updateTask(tasklistId: string, taskId: string, fields: UpdateTaskFields): Promise<unknown>;
  completeTask(tasklistId: string, taskId: string): Promise<unknown>;
  moveTask(tasklistId: string, taskId: string, opts?: MoveTaskOptions): Promise<unknown>;
  deleteTask(tasklistId: string, taskId: string): Promise<void>;
}

export interface PeopleServiceLike {
  listContacts(opts?: ListContactsOptions): Promise<unknown>;
  searchContacts(query: string, opts?: SearchContactsOptions): Promise<unknown>;
  getContact(resourceName: string, personFields?: string): Promise<unknown>;
  createContact(person: Record<string, unknown>): Promise<unknown>;
  updateContact(resourceName: string, person: Record<string, unknown>, updatePersonFields: string): Promise<unknown>;
  deleteContact(resourceName: string): Promise<void>;
  listContactGroups(opts?: ListContactGroupsOptions): Promise<unknown>;
  getContactGroup(resourceName: string): Promise<unknown>;
}

export interface CliServiceFactories {
  gmail(email: string): Promise<GmailServiceLike>;
  calendar(email: string): Promise<CalendarServiceLike>;
  drive(email: string): Promise<DriveServiceLike>;
  docs(email: string): Promise<DocsServiceLike>;
  sheets(email: string): Promise<SheetsServiceLike>;
  tasks(email: string): Promise<TasksServiceLike>;
  people(email: string): Promise<PeopleServiceLike>;
}

export async function resolveAccount(
  authManager: AuthManagerLike,
  explicit?: string,
  loadStateFn: typeof loadState = loadState,
): Promise<string> {
  if (explicit) return explicit;
  if (process.env.GWS_ACCOUNT) return process.env.GWS_ACCOUNT;
  const state = await loadStateFn();
  if (state.current) return state.current;
  const accounts = await authManager.listAccounts();
  if (accounts[0]?.email) return accounts[0].email;
  throw new AuthCliError('No Google Workspace account configured. Run `gws auth login --account you@example.com`.');
}

export async function switchCurrentAccount(
  email: string,
  loadStateFn: typeof loadState = loadState,
  saveStateFn: typeof saveState = saveState,
): Promise<void> {
  await saveStateFn({ ...(await loadStateFn()), current: email });
}

export async function getAuthClient(authManager: AuthManagerLike, email: string): Promise<OAuth2Client> {
  await authManager.initialize();
  const client = await authManager.getAuthClient(email);
  if (!client) throw new AuthCliError(`Account is not authenticated: ${email}`);
  return client;
}

export async function requireKnownAccount(authManager: AuthManagerLike, email: string): Promise<void> {
  const accounts = await authManager.listAccounts();
  if (!accounts.some((account) => account.email === email)) throw new NotFoundCliError(`Unknown account: ${email}`);
}

export async function gmailFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<GmailServiceLike> {
  return new GmailService(await getAuthClient(authManager, email), cache, email);
}

export async function calendarFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<CalendarServiceLike> {
  return new CalendarService(await getAuthClient(authManager, email), cache, email);
}

export async function driveFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<DriveServiceLike> {
  return new DriveService(await getAuthClient(authManager, email), cache, email);
}

export async function docsFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<DocsServiceLike> {
  return new DocsService(await getAuthClient(authManager, email), cache, email);
}

export async function sheetsFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<SheetsServiceLike> {
  return new SheetsService(await getAuthClient(authManager, email), cache, email);
}

export async function tasksFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<TasksServiceLike> {
  return new TasksService(await getAuthClient(authManager, email), cache, email);
}

export async function peopleFor(authManager: AuthManagerLike, cache: CacheManager, email: string): Promise<PeopleServiceLike> {
  return new PeopleService(await getAuthClient(authManager, email), cache, email);
}

export function createServiceFactories(authManager: AuthManagerLike, cache: CacheManager): CliServiceFactories {
  return {
    gmail: (email) => gmailFor(authManager, cache, email),
    calendar: (email) => calendarFor(authManager, cache, email),
    drive: (email) => driveFor(authManager, cache, email),
    docs: (email) => docsFor(authManager, cache, email),
    sheets: (email) => sheetsFor(authManager, cache, email),
    tasks: (email) => tasksFor(authManager, cache, email),
    people: (email) => peopleFor(authManager, cache, email),
  };
}
