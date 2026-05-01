import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createProgram } from '../src/cli/program.js';

const repoRoot = path.resolve(import.meta.dirname, '..');

function runNode(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

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

test('gws-mcp help exits successfully without requiring Google credentials', async () => {
  const result = await runNode(['bin/gws-mcp.js', '--help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: gws-mcp/);
  assert.doesNotMatch(result.stdout + result.stderr, /GoogleAuthManager|credentials\.json/);
});

test('gws-mcp version exits successfully without requiring Google credentials', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf-8'));
  const result = await runNode(['bin/gws-mcp.js', '--version']);

  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), packageJson.version);
  assert.doesNotMatch(result.stdout + result.stderr, /GoogleAuthManager|credentials\.json/);
});
