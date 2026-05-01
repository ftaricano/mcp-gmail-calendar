import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

test('mail profile emits account envelope', async () => {
  const result = await runCli(createProgram, ['mail', 'profile'], {
    state: { current: 'me@example.com' },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    profile: { email: 'me@example.com', messagesTotal: 1 },
  });
});

test('mail send dry-run previews payload without calling service', async () => {
  let sendCalls = 0;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    '--dry-run',
    'mail',
    'send',
    '--to',
    'dest@example.com',
    '--subject',
    'Hello',
    '--body',
    'World',
  ], {
    services: {
      gmail: async () => ({
        getAccountInfo: async () => ({ email: 'me@example.com' }),
        listLabels: async () => [],
        listEmails: async () => ({ emails: [] }),
        searchEmails: async () => [],
        getEmailById: async () => ({ id: 'm1' }),
        sendEmail: async () => {
          sendCalls += 1;
          return 'sent';
        },
        replyToEmail: async () => 'reply',
        forwardEmail: async () => 'forward',
        deleteEmail: async () => undefined,
        markAsRead: async () => undefined,
        markAsUnread: async () => undefined,
        createLabel: async () => 'label-1',
        addLabel: async () => undefined,
        removeLabel: async () => undefined,
        listAttachments: async () => [],
        downloadAttachment: async () => ({ path: '/tmp/out', size: 0 }),
      }),
    },
  });

  assert.equal(sendCalls, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'mail.send',
      payload: {
        to: ['dest@example.com'],
        subject: 'Hello',
        body: 'World',
      },
    },
  });
});

test('mail labels create calls gmail service', async () => {
  let received: unknown;
  const result = await runCli(createProgram, [
    '--account',
    'me@example.com',
    'mail',
    'labels',
    'create',
    'Follow Up',
    '--background-color',
    '#112233',
    '--text-color',
    '#ffffff',
  ], {
    services: {
      gmail: async () => ({
        getAccountInfo: async () => ({ email: 'me@example.com' }),
        listLabels: async () => [],
        listEmails: async () => ({ emails: [] }),
        searchEmails: async () => [],
        getEmailById: async () => ({ id: 'm1' }),
        sendEmail: async () => 'sent',
        replyToEmail: async () => 'reply',
        forwardEmail: async () => 'forward',
        deleteEmail: async () => undefined,
        markAsRead: async () => undefined,
        markAsUnread: async () => undefined,
        createLabel: async (name, options) => {
          received = { name, options };
          return 'label-123';
        },
        addLabel: async () => undefined,
        removeLabel: async () => undefined,
        listAttachments: async () => [],
        downloadAttachment: async () => ({ path: '/tmp/out', size: 0 }),
      }),
    },
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(received, {
    name: 'Follow Up',
    options: { backgroundColor: '#112233', textColor: '#ffffff' },
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    labelId: 'label-123',
    name: 'Follow Up',
  });
});
