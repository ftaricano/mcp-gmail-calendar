import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { createFakeServices, runCli } from './cli-test-helpers.js';
import type { DriveServiceLike } from '../src/cli/program.js';

test('drive trash dry-run returns envelope and does not mutate', async () => {
  const result = await runCli(createProgram, ['--account', 'me@example.com', '--dry-run', 'drive', 'trash', 'file-1']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'drive.trash', fileId: 'file-1' },
  });
});

test('drive restore dry-run returns envelope', async () => {
  const result = await runCli(createProgram, ['--account', 'me@example.com', '--dry-run', 'drive', 'restore', 'file-1']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'drive.restore', fileId: 'file-1' },
  });
});

test('drive copy dry-run includes name and parents', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'drive', 'copy', 'src-1', '--name', 'My Copy', '--parent', 'p1', '--parent', 'p2',
  ]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'drive.copy', fileId: 'src-1', name: 'My Copy', parents: ['p1', 'p2'] },
  });
});

test('drive batch-delete dry-run lists ids and does NOT call the service', async () => {
  let called = false;
  const baseFactories = createFakeServices();
  const baseDrive = await baseFactories.drive('me@example.com');
  const drive: DriveServiceLike = {
    ...baseDrive,
    batchDelete: async (fileIds: string[]) => {
      called = true;
      return fileIds.map((fileId) => ({ fileId, status: 'success' as const }));
    },
  };

  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'drive', 'batch-delete', 'a', 'b', 'c',
  ], {
    services: { drive: async () => drive },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(called, false);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'drive.batch-delete', fileIds: ['a', 'b', 'c'] },
  });
});

test('drive batch-delete without dry-run calls the service', async () => {
  let called = false;
  const baseFactories = createFakeServices();
  const baseDrive = await baseFactories.drive('me@example.com');
  const drive: DriveServiceLike = {
    ...baseDrive,
    batchDelete: async (fileIds: string[]) => {
      called = true;
      return fileIds.map((fileId) => ({ fileId, status: 'success' as const }));
    },
  };

  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'drive', 'batch-delete', 'a', 'b',
  ], {
    services: { drive: async () => drive },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(called, true);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    results: [
      { fileId: 'a', status: 'success' },
      { fileId: 'b', status: 'success' },
    ],
  });
});

test('drive shortcut dry-run returns envelope', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'drive', 'shortcut', 'target-1', '--name', 'Link', '--parent', 'folder-1',
  ]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'drive.shortcut', targetId: 'target-1', name: 'Link', parents: ['folder-1'] },
  });
});

test('drive revisions is read-only and returns items', async () => {
  const result = await runCli(createProgram, ['--account', 'me@example.com', 'drive', 'revisions', 'file-1']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    fileId: 'file-1',
    items: [{ id: 'rev-1' }],
  });
});

test('drive shared-drives is read-only and returns items', async () => {
  const result = await runCli(createProgram, ['--account', 'me@example.com', 'drive', 'shared-drives']);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    items: [{ id: 'sd-1', name: 'Team Drive' }],
  });
});
