import test from 'node:test';
import assert from 'node:assert/strict';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { DriveService } from '../src/services/DriveService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

interface UpdateCall {
  fileId: string;
  requestBody?: Record<string, unknown>;
}

function makeService(overrides: Record<string, unknown> = {}): {
  service: DriveService;
  updates: UpdateCall[];
  copies: unknown[];
  creates: unknown[];
} {
  const updates: UpdateCall[] = [];
  const copies: unknown[] = [];
  const creates: unknown[] = [];

  const service = new DriveService({} as never, new CacheManager(), 'me@example.com', {
    files: {
      list: async () => ({ data: { files: [] } }),
      get: async () => ({ data: { id: 'file-1' } }),
      create: async (input: unknown) => {
        creates.push(input);
        return { data: { id: 'created-1', name: 'shortcut' } };
      },
      update: async (input: UpdateCall) => {
        updates.push(input);
        return { data: { id: input.fileId, name: 'File' } };
      },
      copy: async (input: unknown) => {
        copies.push(input);
        return { data: { id: 'copy-1', name: 'Copy' } };
      },
      ...(overrides.files as Record<string, unknown> ?? {}),
    },
    permissions: { create: async () => ({ data: { id: 'perm-1' } }) },
    revisions: { list: async () => ({ data: { revisions: [{ id: 'rev-1' }] } }) },
    drives: { list: async () => ({ data: { drives: [{ id: 'sd-1' }], nextPageToken: 'next' } }) },
  } as never);

  return { service, updates, copies, creates };
}

test('trashFile sends trashed:true in requestBody', async () => {
  const { service, updates } = makeService();
  await service.trashFile('abc');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].fileId, 'abc');
  assert.deepEqual(updates[0].requestBody, { trashed: true });
});

test('restoreFile sends trashed:false in requestBody', async () => {
  const { service, updates } = makeService();
  await service.restoreFile('abc');
  assert.deepEqual(updates[0].requestBody, { trashed: false });
});

test('copyFile forwards name and parents in requestBody', async () => {
  const { service, copies } = makeService();
  await service.copyFile('src', { name: 'New', parents: ['p1'] });
  const call = copies[0] as { fileId: string; requestBody: Record<string, unknown> };
  assert.equal(call.fileId, 'src');
  assert.deepEqual(call.requestBody, { name: 'New', parents: ['p1'] });
});

test('createShortcut sets shortcut mimeType and shortcutDetails', async () => {
  const { service, creates } = makeService();
  await service.createShortcut('target-1', 'My Shortcut', { parents: ['folder-1'] });
  const call = creates[0] as { requestBody: Record<string, unknown> };
  assert.deepEqual(call.requestBody, {
    name: 'My Shortcut',
    mimeType: 'application/vnd.google-apps.shortcut',
    shortcutDetails: { targetId: 'target-1' },
    parents: ['folder-1'],
  });
});

test('batchDelete trashes each id and reports per-id status', async () => {
  const { service, updates } = makeService();
  const results = await service.batchDelete(['a', 'b', 'c']);
  assert.equal(updates.length, 3);
  for (const update of updates) {
    assert.deepEqual(update.requestBody, { trashed: true });
  }
  assert.deepEqual(results, [
    { fileId: 'a', status: 'success' },
    { fileId: 'b', status: 'success' },
    { fileId: 'c', status: 'success' },
  ]);
});

test('batchDelete does not abort when one id fails', async () => {
  const calls: string[] = [];
  const service = new DriveService({} as never, new CacheManager(), 'me@example.com', {
    files: {
      list: async () => ({ data: { files: [] } }),
      get: async () => ({ data: {} }),
      create: async () => ({ data: {} }),
      update: async (input: UpdateCall) => {
        calls.push(input.fileId);
        if (input.fileId === 'bad') throw new Error('boom');
        return { data: { id: input.fileId } };
      },
      copy: async () => ({ data: {} }),
    },
    permissions: { create: async () => ({ data: {} }) },
    revisions: { list: async () => ({ data: { revisions: [] } }) },
    drives: { list: async () => ({ data: { drives: [] } }) },
  } as never);

  const results = await service.batchDelete(['good1', 'bad', 'good2']);
  assert.deepEqual(calls, ['good1', 'bad', 'good2']);
  assert.equal(results[0].status, 'success');
  assert.equal(results[1].status, 'error');
  assert.equal(results[1].error, 'boom');
  assert.equal(results[2].status, 'success');
});

test('listRevisions returns revisions array (read-only)', async () => {
  const { service } = makeService();
  const revisions = await service.listRevisions('abc');
  assert.deepEqual(revisions, [{ id: 'rev-1' }]);
});

test('listSharedDrives returns drives and nextPageToken', async () => {
  const { service } = makeService();
  const result = await service.listSharedDrives();
  assert.deepEqual(result.drives, [{ id: 'sd-1' }]);
  assert.equal(result.nextPageToken, 'next');
});

// MCP handler layer: zod rejection + happy path (the parity surface added in this PR)
test('handleBatchDelete rejects invalid args with McpError', async () => {
  const { service } = makeService();
  await assert.rejects(() => service.handleBatchDelete({}), (err) => err instanceof McpError);
  await assert.rejects(() => service.handleBatchDelete({ fileIds: [] }), (err) => err instanceof McpError);
});

test('handleBatchDelete validates and returns content envelope', async () => {
  const { service, updates } = makeService();
  const res = await service.handleBatchDelete({ fileIds: ['a', 'b'] });
  assert.equal(updates.length, 2);
  const payload = JSON.parse(res.content[0].text as string);
  assert.equal(payload.length, 2);
  assert.equal(payload[0].status, 'success');
});
