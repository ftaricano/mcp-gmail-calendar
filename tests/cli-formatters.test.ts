import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOutput } from '../src/cli/output/formatters.js';
import { CliError, errorPayload } from '../src/cli/errors.js';

test('formats arrays as jsonl', () => {
  assert.equal(formatOutput([{ a: 1 }, { a: 2 }], 'jsonl'), '{"a":1}\n{"a":2}');
});

test('formats objects as json', () => {
  assert.equal(formatOutput({ ok: true }, 'json'), '{"ok":true}');
});

test('redacts sensitive error details', () => {
  const payload = errorPayload(new CliError('failed', 1, {
    access_token: 'abc',
    refresh_token: 'def',
    nested: { client_secret: 'ghi', note: 'Bearer raw-token' },
  }));
  assert.deepEqual(payload.error.details, {
    access_token: '[REDACTED]',
    refresh_token: '[REDACTED]',
    nested: { client_secret: '[REDACTED]', note: 'Bearer [REDACTED]' },
  });
});
