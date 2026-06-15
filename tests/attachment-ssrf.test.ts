import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { isSafeFetchUrl, assertSafePublicUrl } from '../src/utils/Validator.js';
import { AttachmentHandler, safeFetch } from '../src/utils/AttachmentHandler.js';

type LookupResult = Array<{ address: string; family: number }>;

function stubLookup(map: Record<string, LookupResult>) {
  return async (hostname: string): Promise<LookupResult> => {
    const result = map[hostname];
    if (!result) throw new Error(`unexpected lookup for ${hostname}`);
    return result;
  };
}

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

test('isSafeFetchUrl rejects non-global IPv6 (ULA, link-local, mapped IPv4)', () => {
  const blocked = [
    'http://[fc00::1]/',
    'http://[fd12:3456:789a::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.0.0.1]/',
    'http://[::1]/',
    'http://[::]/',
    'http://[::a00:1]/', // IPv4-compatible / deprecated ::10.0.0.1
  ];

  for (const url of blocked) {
    assert.equal(isSafeFetchUrl(url), false, `expected ${url} to be blocked`);
  }
});

test('isSafeFetchUrl allows global-unicast IPv6', () => {
  assert.equal(isSafeFetchUrl('http://[2606:4700::1111]/'), true);
  assert.equal(isSafeFetchUrl('https://[2001:4860:4860::8888]/'), true);
});

test('assertSafePublicUrl rejects hostnames that resolve to private addresses (DNS rebinding)', async () => {
  const lookup = stubLookup({
    'evil.example.com': [{ address: '127.0.0.1', family: 4 }],
    'rebind.example.com': [{ address: '10.0.0.1', family: 4 }],
  });

  await assert.rejects(
    () => assertSafePublicUrl('http://evil.example.com/x', lookup),
    /blocked address range/i,
  );
  await assert.rejects(
    () => assertSafePublicUrl('http://rebind.example.com/x', lookup),
    /blocked address range/i,
  );
});

test('assertSafePublicUrl rejects if ANY resolved address is private', async () => {
  const lookup = stubLookup({
    'mixed.example.com': [
      { address: '93.184.216.34', family: 4 }, // public
      { address: '169.254.169.254', family: 4 }, // metadata
    ],
  });

  await assert.rejects(
    () => assertSafePublicUrl('http://mixed.example.com/x', lookup),
    /blocked address range/i,
  );
});

test('assertSafePublicUrl allows hostnames that resolve to public addresses', async () => {
  const lookup = stubLookup({
    'good.example.com': [{ address: '93.184.216.34', family: 4 }],
  });

  const result = await assertSafePublicUrl('http://good.example.com/x', lookup);
  assert.deepEqual(result.addresses, ['93.184.216.34']);
});

test('createFromUrl rejects a host that resolves to a private IP (DNS rebinding)', async () => {
  const handler = new AttachmentHandler();
  let fetchCalled = false;

  const lookup = stubLookup({ 'rebind.example.com': [{ address: '127.0.0.1', family: 4 }] });
  const fetchImpl = (async () => {
    fetchCalled = true;
    throw new Error('fetch should not be reached when DNS resolves to a blocked IP');
  }) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      handler.createFromUrl('x.txt', 'http://rebind.example.com/x', undefined, {
        lookupAll: lookup,
        fetchImpl,
      }),
    /blocked address range/i,
  );
  assert.equal(fetchCalled, false, 'fetch must not run once DNS validation fails');
});

test('safeFetch rejects a redirect to a loopback target without downloading it', async () => {
  const lookup = stubLookup({ 'good.example.com': [{ address: '93.184.216.34', family: 4 }] });

  let calls = 0;
  const fetchImpl = (async (input: string) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(input, 'http://good.example.com/start');
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/secret' },
      });
    }
    throw new Error('safeFetch must not issue a request to the redirect target');
  }) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      safeFetch('http://good.example.com/start', {
        lookupAll: lookup,
        fetchImpl,
        maxRedirects: 5,
      }),
    /blocked address range/i,
  );
  assert.equal(calls, 1, 'only the first hop should be requested');
});

test('safeFetch follows a redirect to a validated public host and returns the final response', async () => {
  const lookup = stubLookup({
    'a.example.com': [{ address: '93.184.216.34', family: 4 }],
    'b.example.com': [{ address: '93.184.216.35', family: 4 }],
  });

  let calls = 0;
  const fetchImpl = (async (input: string) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(input, 'http://a.example.com/start');
      return new Response(null, {
        status: 302,
        headers: { location: 'http://b.example.com/final' },
      });
    }
    assert.equal(input, 'http://b.example.com/final');
    return new Response('payload', { status: 200 });
  }) as unknown as typeof fetch;

  const res = await safeFetch('http://a.example.com/start', {
    lookupAll: lookup,
    fetchImpl,
    maxRedirects: 5,
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'payload');
  assert.equal(calls, 2);
});

test('createFromUrl downloads normally from a public host that resolves to a public IP', async () => {
  const prevAllowed = process.env.ALLOWED_ATTACHMENT_TYPES;
  const prevStorage = process.env.ATTACHMENT_STORAGE_DIR;
  process.env.ALLOWED_ATTACHMENT_TYPES = 'txt,pdf,png';
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ssrf-attach-'));
  process.env.ATTACHMENT_STORAGE_DIR = tmpDir;

  const handler = new AttachmentHandler();
  await handler.initialize();
  const lookup = stubLookup({ 'cdn.example.com': [{ address: '93.184.216.34', family: 4 }] });

  const payload = Buffer.from('hello world');
  const fetchImpl = (async () =>
    new Response(payload, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })) as unknown as typeof fetch;

  const meta = await handler.createFromUrl('note.txt', 'http://cdn.example.com/note.txt', undefined, {
    lookupAll: lookup,
    fetchImpl,
  });

  assert.equal(meta.originalFilename, 'note.txt');
  assert.equal(meta.contentType, 'text/plain');
  assert.equal(meta.size, payload.length);

  await handler.deleteAttachment(meta.id);
  await fs.rm(tmpDir, { recursive: true, force: true });

  if (prevAllowed === undefined) {
    delete process.env.ALLOWED_ATTACHMENT_TYPES;
  } else {
    process.env.ALLOWED_ATTACHMENT_TYPES = prevAllowed;
  }
  if (prevStorage === undefined) {
    delete process.env.ATTACHMENT_STORAGE_DIR;
  } else {
    process.env.ATTACHMENT_STORAGE_DIR = prevStorage;
  }
});
