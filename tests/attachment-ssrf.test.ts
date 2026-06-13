import test from 'node:test';
import assert from 'node:assert/strict';

import { isSafeFetchUrl } from '../src/utils/Validator.js';
import { AttachmentHandler } from '../src/utils/AttachmentHandler.js';

test('isSafeFetchUrl rejects loopback, private, and metadata targets', () => {
  const blocked = [
    'http://localhost:3000/oauth2callback',
    'http://localhost/',
    'http://127.0.0.1:3000/',
    'https://127.5.6.7/',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.0.1/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://0.0.0.0/',
    'ftp://example.com/file', // non-http(s) protocol
    'file:///etc/passwd',
  ];

  for (const url of blocked) {
    assert.equal(isSafeFetchUrl(url), false, `expected ${url} to be blocked`);
  }
});

test('isSafeFetchUrl allows public http(s) URLs', () => {
  const allowed = [
    'https://example.com/file.pdf',
    'http://example.com/file.pdf',
    'https://8.8.8.8/file.pdf',
    'https://172.32.0.1/file.pdf', // just outside 172.16.0.0/12
  ];

  for (const url of allowed) {
    assert.equal(isSafeFetchUrl(url), true, `expected ${url} to be allowed`);
  }
});

test('isSafeFetchUrl rejects malformed URLs', () => {
  assert.equal(isSafeFetchUrl('not a url'), false);
  assert.equal(isSafeFetchUrl(''), false);
});

test('createFromUrl refuses to fetch SSRF targets before issuing a request', async () => {
  const handler = new AttachmentHandler();
  let fetchCalled = false;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for blocked URLs');
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => handler.createFromUrl('callback.txt', 'http://localhost:3000/oauth2callback'),
      /unsafe url|not allowed|ssrf|blocked/i,
    );
    assert.equal(fetchCalled, false, 'fetch must not be invoked for a blocked URL');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
