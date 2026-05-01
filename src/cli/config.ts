import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export interface GwsState {
  current?: string;
}

export type GwsConfig = Record<string, unknown>;

export function configDir(): string {
  const configured = process.env.GWS_CONFIG_DIR;
  if (!configured) return path.join(os.homedir(), '.config', 'gws');
  if (configured === '~') return os.homedir();
  if (configured.startsWith('~/')) return path.join(os.homedir(), configured.slice(2));
  return configured;
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export function statePath(): string {
  return path.join(configDir(), 'state.json');
}

async function readJsonFile<T extends object>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: object): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export async function loadConfig(): Promise<GwsConfig> {
  return readJsonFile<GwsConfig>(configPath(), {});
}

export async function saveConfig(config: GwsConfig): Promise<void> {
  await writeJsonFile(configPath(), config);
}

export async function loadState(): Promise<GwsState> {
  return readJsonFile<GwsState>(statePath(), {});
}

export async function saveState(state: GwsState): Promise<void> {
  await writeJsonFile(statePath(), state);
}
