import test from 'node:test';
import assert from 'node:assert/strict';

import { CacheManager } from '../src/utils/CacheManager.js';

test('CacheManager isolates account-scoped entries across accounts and normalizes email casing', () => {
  const cache = new CacheManager();

  cache.setAccountCache('Alice@Example.com', 'gmail:profile', { value: 'alice' });
  cache.setAccountCache('bob@example.com', 'gmail:profile', { value: 'bob' });

  assert.deepEqual(cache.getAccountCache('alice@example.com', 'gmail:profile'), { value: 'alice' });
  assert.deepEqual(cache.getAccountCache('BOB@example.com', 'gmail:profile'), { value: 'bob' });
  assert.equal(cache.getAccountCache('charlie@example.com', 'gmail:profile'), undefined);

  cache.flush();
});

test('CacheManager account deletion only clears the targeted account namespace', () => {
  const cache = new CacheManager();

  cache.setAccountCache('alice@example.com', 'gmail:profile', { profile: 1 });
  cache.setAccountCache('alice@example.com', 'gmail:labels', ['INBOX']);
  cache.setAccountCache('bob@example.com', 'gmail:profile', { profile: 2 });

  const deleted = cache.deleteAccountCache('ALICE@example.com');

  assert.equal(deleted, 2);
  assert.equal(cache.getAccountCache('alice@example.com', 'gmail:profile'), undefined);
  assert.equal(cache.getAccountCache('alice@example.com', 'gmail:labels'), undefined);
  assert.deepEqual(cache.getAccountCache('bob@example.com', 'gmail:profile'), { profile: 2 });

  cache.flush();
});
