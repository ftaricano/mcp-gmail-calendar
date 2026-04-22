import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeLogMeta } from '../src/utils/Logger.js';

test('sanitizeLogMeta redacts sensitive keys recursively in nested objects and arrays', () => {
  const sanitized = sanitizeLogMeta({
    authorization: 'Bearer secret-token',
    nested: {
      refreshToken: 'refresh-secret',
      safe: 'value',
    },
    items: [
      { bodyHtml: '<p>secret</p>' },
      { keep: 'visible' },
    ],
  });

  assert.deepEqual(sanitized, {
    authorization: '[REDACTED]',
    nested: {
      refreshToken: '[REDACTED]',
      safe: 'value',
    },
    items: [
      { bodyHtml: '[REDACTED]' },
      { keep: 'visible' },
    ],
  });
});

test('sanitizeLogMeta preserves debuggability for circular references and Error instances', () => {
  const circular: Record<string, unknown> = { token: 'secret' };
  circular.self = circular;

  const error = new Error('boom');
  const sanitized = sanitizeLogMeta({ circular, error }) as Record<string, any>;

  assert.equal(sanitized.circular.token, '[REDACTED]');
  assert.equal(sanitized.circular.self, '[Circular]');
  assert.equal(sanitized.error.error, 'boom');
  assert.equal(typeof sanitized.error.stack, 'string');
});
