import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  collectValues,
  parseBooleanInput,
  parseEmailList,
  parseEnumValue,
  parsePositiveInteger,
  parseStructuredJsonInput,
} from '../src/cli/parsers.js';

test('parsePositiveInteger accepts positive numbers', () => {
  assert.equal(parsePositiveInteger('42', 'limit'), 42);
});

test('parsePositiveInteger rejects zero and non-numbers', () => {
  assert.throws(() => parsePositiveInteger('0', 'limit'), /limit must be a positive integer/i);
  assert.throws(() => parsePositiveInteger('abc', 'limit'), /limit must be a positive integer/i);
});

test('parseBooleanInput accepts booleans and common strings', () => {
  assert.equal(parseBooleanInput(true, 'notify'), true);
  assert.equal(parseBooleanInput('false', 'notify'), false);
  assert.equal(parseBooleanInput('YES', 'notify'), true);
});

test('parseBooleanInput rejects unsupported values', () => {
  assert.throws(() => parseBooleanInput('maybe', 'notify'), /notify must be a boolean/i);
});

test('parseEnumValue accepts allowed values and rejects unsupported values', () => {
  assert.equal(parseEnumValue('writer', ['reader', 'commenter', 'writer'] as const, 'role'), 'writer');
  assert.throws(() => parseEnumValue('owner', ['reader', 'commenter', 'writer'] as const, 'role'), /role must be one of/i);
});

test('parseEmailList splits csv values and validates addresses', () => {
  assert.deepEqual(parseEmailList('a@example.com, b@example.com'), ['a@example.com', 'b@example.com']);
  assert.throws(() => parseEmailList('bad-email'), /invalid email/i);
});

test('collectValues appends repeated commander options', () => {
  assert.deepEqual(collectValues('alpha', ['beta']), ['beta', 'alpha']);
});

test('parseStructuredJsonInput accepts inline json, files, and stdin marker', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gws-json-'));
  const jsonFile = path.join(tempDir, 'payload.json');
  await fs.writeFile(jsonFile, JSON.stringify({ source: 'file' }));

  try {
    assert.deepEqual(
      await parseStructuredJsonInput({ json: '{"source":"inline"}', readStdin: async () => '' }, 'payload'),
      { source: 'inline' },
    );

    assert.deepEqual(
      await parseStructuredJsonInput({ jsonFile, readStdin: async () => '' }, 'payload'),
      { source: 'file' },
    );

    assert.deepEqual(
      await parseStructuredJsonInput({ json: '-', readStdin: async () => '{"source":"stdin"}' }, 'payload'),
      { source: 'stdin' },
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
