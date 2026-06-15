import type { Command } from 'commander';
import dotenv from 'dotenv';
import { CacheManager } from '../utils/CacheManager.js';
import { GoogleAuthManager } from '../auth/GoogleAuthManager.js';
import { errorPayload, exitCodeFor } from './errors.js';
import { formatOutput } from './output/formatters.js';
import { parseOutputFormat } from './options.js';
import { configPath, loadConfig, loadState, saveConfig, saveState, statePath } from './config.js';
import {
  type AuthManagerLike,
  type CliServiceFactories,
  createServiceFactories,
} from './context.js';

dotenv.config();

export interface WritableLike {
  isTTY?: boolean;
  write(chunk: string | Uint8Array): unknown;
}

export interface CreateProgramOptions {
  authManager?: AuthManagerLike;
  cache?: CacheManager;
  services?: Partial<CliServiceFactories>;
  loadConfig?: typeof loadConfig;
  saveConfig?: typeof saveConfig;
  loadState?: typeof loadState;
  saveState?: typeof saveState;
  stdout?: WritableLike;
  stderr?: WritableLike;
  readStdin?: () => Promise<string>;
  version?: string;
  installSignalHandlers?: boolean;
}

export interface CliRuntime {
  authManager: AuthManagerLike;
  cache: CacheManager;
  services: CliServiceFactories;
  loadConfig: typeof loadConfig;
  saveConfig: typeof saveConfig;
  loadState: typeof loadState;
  saveState: typeof saveState;
  stdout: WritableLike;
  stderr: WritableLike;
  readStdin: () => Promise<string>;
  version: string;
  configPath: typeof configPath;
  statePath: typeof statePath;
  now: () => number;
}

function createReadStdin(readStdin?: () => Promise<string>): () => Promise<string> {
  if (readStdin) return readStdin;

  let pending: Promise<string> | undefined;
  return async () => {
    if (pending) return pending;
    pending = new Promise<string>((resolve, reject) => {
      let text = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => {
        text += chunk;
      });
      process.stdin.on('end', () => resolve(text));
      process.stdin.on('error', reject);
      process.stdin.resume();
    });
    return pending;
  };
}

export function createCliRuntime(options: CreateProgramOptions = {}): CliRuntime {
  const authManager = options.authManager ?? new GoogleAuthManager();
  const cache = options.cache ?? new CacheManager();
  const defaults = createServiceFactories(authManager, cache);

  return {
    authManager,
    cache,
    services: {
      ...defaults,
      ...options.services,
    },
    loadConfig: options.loadConfig ?? loadConfig,
    saveConfig: options.saveConfig ?? saveConfig,
    loadState: options.loadState ?? loadState,
    saveState: options.saveState ?? saveState,
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr,
    readStdin: createReadStdin(options.readStdin),
    // TODO: derive from package.json to avoid drift (package.json sits outside rootDir, so it cannot be imported under the current tsconfig).
    version: options.version ?? '1.1.0',
    configPath,
    statePath,
    now: () => Date.now(),
  };
}

export function emitOutput(program: Command, runtime: CliRuntime, data: unknown): void {
  const format = parseOutputFormat(program.optsWithGlobals().format || 'json');
  runtime.stdout.write(`${formatOutput(data, format)}\n`);
}

export async function runAction(
  program: Command,
  runtime: CliRuntime,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    const result = await fn();
    if (result !== undefined) emitOutput(program, runtime, result);
  } catch (error) {
    runtime.stderr.write(`${JSON.stringify(errorPayload(error), null, 2)}\n`);
    process.exitCode = exitCodeFor(error);
  }
}

export function installSignalHandlers(runtime: CliRuntime): void {
  const cleanupAndExit = (signal: NodeJS.Signals) => {
    runtime.authManager.cleanupAuthServers();
    runtime.stderr.write(`Received ${signal}; closed pending OAuth listeners.\n`);
    process.exit(130);
  };

  process.once('SIGINT', cleanupAndExit);
  process.once('SIGTERM', cleanupAndExit);
}
