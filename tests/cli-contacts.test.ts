import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import type { PeopleServiceLike } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

function spyPeople(calls: string[]): PeopleServiceLike {
  return {
    listContacts: async () => {
      calls.push('listContacts');
      return { connections: [{ resourceName: 'people/c1' }] };
    },
    searchContacts: async () => {
      calls.push('searchContacts');
      return { results: [{ person: { resourceName: 'people/c1' } }] };
    },
    getContact: async (resourceName: string) => {
      calls.push('getContact');
      return { resourceName };
    },
    createContact: async () => {
      calls.push('createContact');
      return { resourceName: 'people/new' };
    },
    updateContact: async () => {
      calls.push('updateContact');
      return { resourceName: 'people/c1' };
    },
    deleteContact: async () => {
      calls.push('deleteContact');
    },
    listContactGroups: async () => {
      calls.push('listContactGroups');
      return { contactGroups: [{ resourceName: 'contactGroups/g1' }] };
    },
    getContactGroup: async (resourceName: string) => {
      calls.push('getContactGroup');
      return { resourceName };
    },
  };
}

test('contacts create dry-run builds payload and skips service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'contacts', 'create', '--json', '{"names":[{"givenName":"Ada"}]}',
  ], { services: { people: async () => spyPeople(calls) } });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'contacts.create', person: { names: [{ givenName: 'Ada' }] } },
  });
  assert.deepEqual(calls, []);
});

test('contacts update dry-run includes updatePersonFields and skips service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'contacts', 'update', 'people/c1', '--json', '{"names":[{"givenName":"Grace"}]}', '--fields', 'names',
  ], { services: { people: async () => spyPeople(calls) } });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'contacts.update',
      resourceName: 'people/c1',
      updatePersonFields: 'names',
      person: { names: [{ givenName: 'Grace' }] },
    },
  });
  assert.deepEqual(calls, []);
});

test('contacts delete dry-run does not call the service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'contacts', 'delete', 'people/c1',
  ], { services: { people: async () => spyPeople(calls) } });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'contacts.delete', resourceName: 'people/c1' },
  });
  assert.deepEqual(calls, []);
});

test('contacts create with malformed JSON reports a clear error', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'contacts', 'create', '--json', '{not valid',
  ], { services: { people: async () => spyPeople(calls) } });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Contact person JSON must be valid JSON/);
  assert.deepEqual(calls, []);
});

test('contacts list read happy path calls the service', async () => {
  const calls: string[] = [];
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'contacts', 'list',
  ], { services: { people: async () => spyPeople(calls) } });

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.account, 'me@example.com');
  assert.deepEqual(payload.result, { connections: [{ resourceName: 'people/c1' }] });
  assert.deepEqual(calls, ['listContacts']);
});
