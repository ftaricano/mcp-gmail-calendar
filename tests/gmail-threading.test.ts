import test from 'node:test';
import assert from 'node:assert/strict';
import { GmailService, type GmailApiLike } from '../src/services/GmailService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

function decodeRaw(raw: string): string {
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

test('replyToEmail emits threading headers and forwards threadId', async () => {
  let sentRequestBody: any;

  const gmailApi = {
    users: {
      messages: {
        send: async (input: any) => {
          sentRequestBody = input.requestBody;
          return { data: { id: 'reply-msg-1' } };
        },
        get: async (input: any) => {
          // First call: full (getEmailById in replyToEmail)
          if (input.format === 'full') {
            return {
              data: {
                id: input.id,
                threadId: '<thread>',
                labelIds: [],
                snippet: '',
                payload: {
                  headers: [
                    { name: 'From', value: 'origin@example.com' },
                    { name: 'Subject', value: 'Original' },
                    { name: 'To', value: 'me@example.com' },
                  ],
                },
              },
            };
          }
          // metadata call
          return {
            data: {
              payload: {
                headers: [
                  { name: 'Message-ID', value: '<mid@x>' },
                  { name: 'References', value: '<older@x>' },
                ],
              },
            },
          };
        },
      },
    },
  } as unknown as GmailApiLike;

  const service = new GmailService({} as never, new CacheManager(), 'me@example.com', gmailApi);
  const id = await service.replyToEmail('orig-1', { body: 'reply body' });

  assert.equal(id, 'reply-msg-1');
  assert.equal(sentRequestBody.threadId, '<thread>');
  const decoded = decodeRaw(sentRequestBody.raw);
  assert.ok(decoded.includes('In-Reply-To: <mid@x>'), 'should contain In-Reply-To header');
  assert.ok(decoded.includes('References: <older@x> <mid@x>'), 'should contain References header with chained value');
});
