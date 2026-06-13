import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configDir, configPath, loadConfig, loadState, saveConfig, saveState } from '../src/cli/config.js';

test('config helpers honor isolated GWS_CONFIG_DIR', async () => {
  const previous = process.env.GWS_CONFIG_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gws-config-'));
  try {
    process.env.GWS_CONFIG_DIR = dir;
    assert.equal(configPath(), path.join(dir, 'config.json'));
    process.env.GWS_CONFIG_DIR = '~/custom-gws';
    assert.equal(configDir(), path.join(os.homedir(), 'custom-gws'));
    process.env.GWS_CONFIG_DIR = dir;
    await saveConfig({ defaultCalendar: 'primary', timezone: 'America/Sao_Paulo' });
    assert.deepEqual(await loadConfig(), { defaultCalendar: 'primary', timezone: 'America/Sao_Paulo' });
    await saveState({ current: 'me@example.com' });
    assert.deepEqual(await loadState(), { current: 'me@example.com' });
  } finally {
    if (previous === undefined) delete process.env.GWS_CONFIG_DIR;
    else process.env.GWS_CONFIG_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
