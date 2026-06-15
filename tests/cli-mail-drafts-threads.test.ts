import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

test('mail drafts create dry-run previews payload without calling service', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    '--dry-run',
    'mail', 'drafts', 'create',
    '--to', 'dest@example.com',
    '--subject', 'Hi',
    '--body', 'Body',
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'mail.drafts.create',
      payload: { to: ['dest@example.com'], subject: 'Hi', body: 'Body' },
    },
  });
});

test('mail drafts update dry-run previews payload without calling service', async () => {
  let updateCalls = 0;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    '--dry-run',
    'mail', 'drafts', 'update', 'd-7',
    '--to', 'dest@example.com',
    '--subject', 'Hi',
    '--body', 'Body',
  ], {
    services: {
      gmail: async () => ({
        updateDraft: async () => { updateCalls += 1; return 'd-7'; },
      }) as never,
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(updateCalls, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'mail.drafts.update',
      draftId: 'd-7',
      payload: { to: ['dest@example.com'], subject: 'Hi', body: 'Body' },
    },
  });
});

test('mail drafts create dry-run without to/subject previews WIP envelope', async () => {
  let createCalls = 0;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    '--dry-run',
    'mail', 'drafts', 'create',
    '--body', 'WIP body',
  ], {
    services: {
      gmail: async () => ({
        createDraft: async () => { createCalls += 1; return 'draft-1'; },
      }) as never,
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(createCalls, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'mail.drafts.create',
      payload: { body: 'WIP body' },
    },
  });
});

test('mail threads modify without labels fails validation and does not call service', async () => {
  let modifyCalls = 0;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'mail', 'threads', 'modify', 't-1',
  ], {
    services: {
      gmail: async () => ({
        modifyThread: async () => { modifyCalls += 1; return { id: 't-1' }; },
      }) as never,
    },
  });

  assert.notEqual(result.exitCode, 0);
  assert.equal(modifyCalls, 0);
  assert.match(result.stderr, /add-label|remove-label/);
});

test('mail drafts list returns items envelope', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'mail', 'drafts', 'list',
  ]);

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.account, 'me@example.com');
  assert.deepEqual(parsed.items, [{ id: 'draft-1' }]);
});

test('mail threads modify dry-run reflects label ids', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    '--dry-run',
    'mail', 'threads', 'modify', 't-1',
    '--add-label', 'L1',
    '--remove-label', 'L2',
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'mail.threads.modify',
      threadId: 't-1',
      addLabelIds: ['L1'],
      removeLabelIds: ['L2'],
    },
  });
});

test('mail archive dry-run previews action', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    '--dry-run',
    'mail', 'archive', 'm-1',
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'mail.archive', messageId: 'm-1' },
  });
});

test('mail delete dry-run reflects trash action', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    '--dry-run',
    'mail', 'delete', 'm-2',
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'mail.delete', messageId: 'm-2' },
  });
});

test('mail delete calls trash path', async () => {
  let trashCalls = 0;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'mail', 'delete', 'm-3',
  ], {
    services: {
      gmail: async () => ({
        deleteEmail: async () => { trashCalls += 1; },
      }) as never,
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(trashCalls, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    deleted: 'm-3',
  });
});
