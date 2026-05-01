import { OAuth2Client } from 'google-auth-library';
import { GoogleAuthManager } from '../auth/GoogleAuthManager.js';
import { CacheManager } from '../utils/CacheManager.js';
import { GmailService } from '../services/GmailService.js';
import { CalendarService } from '../services/CalendarService.js';
import { AuthCliError, NotFoundCliError } from './errors.js';
import { loadState, saveState } from './config.js';

export interface CliGlobals {
  account?: string;
  format?: string;
  quiet?: boolean;
  dryRun?: boolean;
}

export async function resolveAccount(authManager: GoogleAuthManager, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (process.env.GWS_ACCOUNT) return process.env.GWS_ACCOUNT;
  const state = await loadState();
  if (state.current) return state.current;
  const accounts = await authManager.listAccounts();
  if (accounts[0]?.email) return accounts[0].email;
  throw new AuthCliError('No Google Workspace account configured. Run `gws auth login --account you@example.com`.');
}

export async function switchCurrentAccount(email: string): Promise<void> {
  await saveState({ ...(await loadState()), current: email });
}

export async function getAuthClient(authManager: GoogleAuthManager, email: string): Promise<OAuth2Client> {
  await authManager.initialize();
  const client = await authManager.getAuthClient(email);
  if (!client) throw new AuthCliError(`Account is not authenticated: ${email}`);
  return client;
}

export async function requireKnownAccount(authManager: GoogleAuthManager, email: string): Promise<void> {
  const accounts = await authManager.listAccounts();
  if (!accounts.some((account) => account.email === email)) throw new NotFoundCliError(`Unknown account: ${email}`);
}

export async function gmailFor(authManager: GoogleAuthManager, cache: CacheManager, email: string): Promise<GmailService> {
  return new GmailService(await getAuthClient(authManager, email), cache, email);
}

export async function calendarFor(authManager: GoogleAuthManager, cache: CacheManager, email: string): Promise<CalendarService> {
  return new CalendarService(await getAuthClient(authManager, email), cache, email);
}
