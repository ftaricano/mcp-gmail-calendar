import test from 'node:test';
import assert from 'node:assert/strict';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { PeopleService } from '../src/services/PeopleService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

interface Captured {
  create?: unknown;
  update?: unknown;
  delete?: unknown;
  search?: unknown;
  getCalls?: unknown[];
}

function makeService(captured: Captured = {}): PeopleService {
  captured.getCalls = captured.getCalls ?? [];
  return new PeopleService({} as never, new CacheManager(), 'me@example.com', {
    people: {
      connections: {
        list: async () => ({ data: { connections: [{ resourceName: 'people/c1' }] } }),
      },
      searchContacts: async (input: unknown) => {
        captured.search = input;
        return { data: { results: [{ person: { resourceName: 'people/c1' } }] } };
      },
      get: async (input: unknown) => {
        (captured.getCalls as unknown[]).push(input);
        return { data: { resourceName: (input as { resourceName: string }).resourceName, etag: 'etag-123' } };
      },
      createContact: async (input: unknown) => {
        captured.create = input;
        return { data: { resourceName: 'people/new' } };
      },
      updateContact: async (input: unknown) => {
        captured.update = input;
        return { data: { resourceName: (input as { resourceName: string }).resourceName, updated: true } };
      },
      deleteContact: async (input: unknown) => {
        captured.delete = input;
        return { data: {} };
      },
    } as never,
    contactGroups: {
      list: async () => ({ data: { contactGroups: [{ resourceName: 'contactGroups/g1' }] } }),
      get: async (input: unknown) => ({ data: { resourceName: (input as { resourceName: string }).resourceName } }),
    } as never,
  });
}

test('createContact forwards person as requestBody and invalidates cache', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.createContact({ names: [{ givenName: 'Ada' }] });
  assert.deepEqual(captured.create, { requestBody: { names: [{ givenName: 'Ada' }] } });
});

test('updateContact fetches etag via get and forwards it in requestBody', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.updateContact('people/c1', { names: [{ givenName: 'Grace' }] }, 'names');
  // etag must come from the people.get(metadata) call
  assert.deepEqual((captured.getCalls as unknown[])[0], { resourceName: 'people/c1', personFields: 'metadata' });
  assert.deepEqual(captured.update, {
    resourceName: 'people/c1',
    updatePersonFields: 'names',
    requestBody: { names: [{ givenName: 'Grace' }], etag: 'etag-123' },
  });
});

test('updateContact reuses etag from input without calling get', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.updateContact('people/c1', { etag: 'input-etag', names: [{ givenName: 'X' }] }, 'names');
  assert.equal((captured.getCalls as unknown[]).length, 0, 'should not call get when etag provided');
  const update = captured.update as { requestBody: { etag: string } };
  assert.equal(update.requestBody.etag, 'input-etag');
});

test('deleteContact forwards resourceName', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.deleteContact('people/c1');
  assert.deepEqual(captured.delete, { resourceName: 'people/c1' });
});

test('searchContacts forwards query, readMask default and pageSize', async () => {
  const captured: Captured = {};
  const service = makeService(captured);
  await service.searchContacts('ada', { pageSize: 5 });
  assert.deepEqual(captured.search, {
    query: 'ada',
    readMask: 'names,emailAddresses,phoneNumbers',
    pageSize: 5,
  });
});

test('listContacts caches the unpaginated listing and invalidates on mutation', async () => {
  let listCalls = 0;
  const service = new PeopleService({} as never, new CacheManager(), 'me@example.com', {
    people: {
      connections: {
        list: async () => { listCalls += 1; return { data: { connections: [{ resourceName: 'people/c1' }] } }; },
      },
      createContact: async () => ({ data: { resourceName: 'people/new' } }),
    } as never,
    contactGroups: {} as never,
  });

  await service.listContacts();
  await service.listContacts();
  assert.equal(listCalls, 1, 'second call should be served from cache');

  await service.createContact({ names: [{ givenName: 'X' }] }); // invalidates people:contacts
  await service.listContacts();
  assert.equal(listCalls, 2, 'cache should be refreshed after a mutation');
});

test('handleUpdateContact rejects missing updatePersonFields with McpError', async () => {
  const service = makeService();
  await assert.rejects(
    () => service.handleUpdateContact({ resourceName: 'people/c1', person: { names: [] } }),
    (err: unknown) => err instanceof McpError,
  );
});

test('handleCreateContact happy path returns json content', async () => {
  const service = makeService();
  const result = await service.handleCreateContact({ person: { names: [{ givenName: 'Ada' }] } });
  assert.equal(result.content[0].type, 'text');
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.resourceName, 'people/new');
});
