import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createProgram } from '../src/cli/program.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('package metadata includes gws and gws-mcp bins', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf-8'));
  assert.deepEqual(packageJson.bin, {
    gws: './bin/gws.js',
    'gws-mcp': './bin/gws-mcp.js',
  });
});

test('program help includes doctor and workspace command groups', () => {
  const help = createProgram({ installSignalHandlers: false }).helpInformation();
  assert.match(help, /\bdoctor\b/);
  assert.match(help, /\bdrive\b/);
  assert.match(help, /\bdocs\b/);
  assert.match(help, /\bsheets\b/);
});
