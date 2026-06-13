import test from 'node:test';
import assert from 'node:assert/strict';
import type http from 'http';

import { GoogleAuthManager } from '../src/auth/GoogleAuthManager.js';

test('OAuth callback server binds to loopback (127.0.0.1) only', async () => {
  // Use a randomized high port to avoid collisions across test runs.
  process.env.OAUTH_CALLBACK_PORT = String(40000 + Math.floor(Math.random() * 20000));

  const manager = new GoogleAuthManager();
  const state = 'test-state';

  // startAuthServer is private; invoke it directly with a stub OAuth client.
  // It only needs to reach server.listen() to register the bound server.
  const fakeClient = {} as unknown;
  await (manager as any).startAuthServer(fakeClient, 'user@example.com', state);

  const servers: Map<string, http.Server> = (manager as any).authServers;
  const server = servers.get(state);
  assert.ok(server, 'server should be registered after listen');

  const address = server!.address();
  assert.ok(address && typeof address === 'object', 'address should be an AddressInfo object');
  assert.equal(
    (address as { address: string }).address,
    '127.0.0.1',
    'callback server must bind to loopback, not 0.0.0.0',
  );

  server!.close();
});
