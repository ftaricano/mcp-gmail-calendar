import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

import { GoogleAuthManager } from '../src/auth/GoogleAuthManager.js';

const LOOPBACK = new Set(['127.0.0.1', '::1']);

// Detect whether the host actually has an IPv6 loopback we can bind to.
async function hasIpv6Loopback(): Promise<boolean> {
  return await new Promise((resolve) => {
    const probe = http.createServer();
    probe.on('error', () => resolve(false));
    probe.listen(0, '::1', () => {
      probe.close(() => resolve(true));
    });
  });
}

function randomPort(): number {
  return 40000 + Math.floor(Math.random() * 20000);
}

// Fire a single GET and resolve with status + body.
function getOnce(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

test('OAuth callback server binds to loopback only (127.0.0.1 and, when available, ::1)', async () => {
  process.env.OAUTH_CALLBACK_PORT = String(randomPort());

  const manager = new GoogleAuthManager();
  const state = 'test-state';

  // startAuthServer is private; invoke it directly with a stub OAuth client.
  // It only needs to reach listen() to register the bound servers.
  const fakeClient = {} as unknown;
  await (manager as any).startAuthServer(fakeClient, 'user@example.com', state);

  // Give the best-effort ::1 listen() callback a tick to register.
  await new Promise((r) => setTimeout(r, 50));

  const servers: Map<string, http.Server[]> = (manager as any).authServers;
  const bound = servers.get(state);
  assert.ok(Array.isArray(bound) && bound.length >= 1, 'at least the IPv4 listener should register');

  const addresses = bound!.map((s) => {
    const a = s.address();
    assert.ok(a && typeof a === 'object', 'address should be an AddressInfo object');
    return (a as { address: string }).address;
  });

  // Every listener must be loopback — never 0.0.0.0 or ::.
  for (const addr of addresses) {
    assert.ok(LOOPBACK.has(addr), `listener bound to non-loopback address: ${addr}`);
  }

  // IPv4 loopback is the guaranteed minimum.
  assert.ok(addresses.includes('127.0.0.1'), 'must bind IPv4 loopback');

  if (await hasIpv6Loopback()) {
    assert.ok(addresses.includes('::1'), 'must also bind IPv6 loopback when available');
  }

  for (const s of bound!) s.close();
});

// Integration: drive a real callback through each loopback family and confirm
// the shared handler processes it (200 + token persisted + cleanup).
async function runCallbackIntegration(family: '127.0.0.1' | '::1'): Promise<void> {
  const port = randomPort();
  process.env.OAUTH_CALLBACK_PORT = String(port);

  const tokensDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gauth-test-'));
  process.env.TOKENS_PATH = tokensDir;

  const manager = new GoogleAuthManager();
  (manager as any).tokensPath = tokensDir;

  const state = `state-${family}`;
  const email = 'user@example.com';

  // Stub the OAuth client + userinfo so no network egress happens.
  const stubbedTokens = { access_token: 'a', refresh_token: 'r', scope: 'x', token_type: 'Bearer' };
  const fakeClient = {
    getToken: async () => ({ tokens: stubbedTokens }),
    setCredentials: () => {},
  } as unknown;

  // googleapis oauth2().userinfo.get() is called inside the handler. Patch the
  // module-level google.oauth2 to return a stub.
  const mod = await import('googleapis');
  const originalOauth2 = (mod.google as any).oauth2;
  (mod.google as any).oauth2 = () => ({
    userinfo: { get: async () => ({ data: { email, name: 'Test User' } }) },
  });

  try {
    const done = (manager as any).startAuthServer(fakeClient, email, state) as Promise<void>;

    // Wait for both listeners to be ready.
    await new Promise((r) => setTimeout(r, 80));

    const host = family === '::1' ? '[::1]' : '127.0.0.1';
    const res = await getOnce(
      `http://${host}:${port}/oauth2callback?code=abc&state=${state}`,
    );

    assert.equal(res.status, 200, `callback via ${family} should return 200`);
    assert.match(res.body, /Authentication Successful/);

    await done;

    // Token persisted.
    const tokenFile = path.join(tokensDir, `${email}.json`);
    const persisted = JSON.parse(await fs.readFile(tokenFile, 'utf-8'));
    assert.equal(persisted.tokens.access_token, 'a');

    // Cleanup: server entry removed from tracking.
    const servers: Map<string, http.Server[]> = (manager as any).authServers;
    assert.equal(servers.has(state), false, 'auth server entry should be cleared after success');
  } finally {
    (mod.google as any).oauth2 = originalOauth2;
    (manager as any).cleanupAuthServers();
    await fs.rm(tokensDir, { recursive: true, force: true });
  }
}

test('OAuth callback is processed via IPv4 loopback (127.0.0.1)', async () => {
  await runCallbackIntegration('127.0.0.1');
});

test('OAuth callback is processed via IPv6 loopback (::1) when available', async (t) => {
  if (!(await hasIpv6Loopback())) {
    t.skip('host has no IPv6 loopback');
    return;
  }
  await runCallbackIntegration('::1');
});

// Bind a dummy listener and resolve once it is actually listening.
function occupy(host: string, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const dummy = http.createServer();
    dummy.on('error', reject);
    dummy.listen(port, host, () => resolve(dummy));
  });
}

// Security regression: if [::1]:port is already occupied (EADDRINUSE), the
// flow MUST reject rather than silently degrade to IPv4-only. Degrading would
// let the OAuth callback (with the authorization code) be delivered to the
// other process that holds ::1, since the redirect URI is http://localhost.
test('startAuthServer rejects when [::1]:port is occupied (no fail-open to IPv4)', async (t) => {
  if (!(await hasIpv6Loopback())) {
    t.skip('host has no IPv6 loopback');
    return;
  }

  const port = randomPort();
  process.env.OAUTH_CALLBACK_PORT = String(port);

  // Pre-occupy the IPv6 loopback on the target port. IPv4 (127.0.0.1) is left
  // free so the IPv4 bind succeeds and only the ::1 bind hits EADDRINUSE.
  const squatter = await occupy('::1', port);

  const manager = new GoogleAuthManager();
  const state = 'eaddrinuse-state';
  const fakeClient = {} as unknown;

  try {
    await assert.rejects(
      (manager as any).startAuthServer(fakeClient, 'user@example.com', state),
      (err: Error) => {
        assert.match(err.message, /\[::1\]/, 'error should mention the ::1 bind');
        return true;
      },
      'startAuthServer must reject (not degrade) when ::1 is occupied',
    );

    // No leak: the IPv4 listener that was opened must be closed, and no state
    // should remain tracked.
    const servers: Map<string, http.Server[]> = (manager as any).authServers;
    assert.equal(servers.has(state), false, 'auth server state must be cleared on reject');

    const pending: Map<string, string> = (manager as any).pendingAuthUrls;
    assert.equal(pending.has(state), false, 'pending auth state must be cleared on reject');

    // The IPv4 loopback port must be free again (listener closed, no leak).
    const reclaimed = await occupy('127.0.0.1', port);
    reclaimed.close();
  } finally {
    squatter.close();
  }
});

// Legitimate degrade: when the ::1 bind fails with EAFNOSUPPORT (IPv6 stack
// genuinely unavailable), the flow degrades to IPv4-only and resolves. We
// simulate the unavailable host by stubbing http.createServer so the second
// server (the ::1 one) emits EAFNOSUPPORT on listen() instead of binding.
test('startAuthServer degrades to IPv4-only when ::1 is genuinely unavailable (EAFNOSUPPORT)', async () => {
  const port = randomPort();
  process.env.OAUTH_CALLBACK_PORT = String(port);

  const realCreateServer = http.createServer.bind(http);
  let calls = 0;

  (http as any).createServer = (...args: any[]) => {
    calls += 1;
    if (calls === 2) {
      // The second createServer is the ::1 listener. Return a fake server whose
      // listen() asynchronously emits an EAFNOSUPPORT error.
      const listeners: Record<string, Array<(...a: any[]) => void>> = {};
      const fake: any = {
        on(event: string, cb: (...a: any[]) => void) {
          (listeners[event] ||= []).push(cb);
          return fake;
        },
        listen() {
          setImmediate(() => {
            const err: NodeJS.ErrnoException = new Error('address family not supported');
            err.code = 'EAFNOSUPPORT';
            for (const cb of listeners['error'] ?? []) cb(err);
          });
          return fake;
        },
        close() {
          return fake;
        },
        address() {
          return null;
        },
      };
      return fake;
    }
    return realCreateServer(...(args as []));
  };

  const manager = new GoogleAuthManager();
  const state = 'eafnosupport-state';
  const fakeClient = {} as unknown;

  try {
    // Must resolve (degrade), not reject.
    await (manager as any).startAuthServer(fakeClient, 'user@example.com', state);

    const servers: Map<string, http.Server[]> = (manager as any).authServers;
    const bound = servers.get(state);
    assert.ok(Array.isArray(bound) && bound.length === 1, 'only the IPv4 listener should remain');

    const a = bound![0].address();
    assert.ok(a && typeof a === 'object', 'IPv4 address should be an AddressInfo object');
    assert.equal((a as { address: string }).address, '127.0.0.1', 'remaining listener is IPv4 loopback');
  } finally {
    (http as any).createServer = realCreateServer;
    (manager as any).cleanupAuthServers();
  }
});
