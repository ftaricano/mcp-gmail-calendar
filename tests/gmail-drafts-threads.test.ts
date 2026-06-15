import test from 'node:test';
import assert from 'node:assert/strict';
import { GmailService, type GmailApiLike } from '../src/services/GmailService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

function makeService(captured: Record<string, any>): GmailService {
  const gmailApi = {
    users: {
      messages: {
        modify: async (input: any) => {
          captured.messagesModify = input;
          return { data: { id: input.id } };
        },
        delete: async (input: any) => {
          captured.messagesDelete = input;
          return { data: {} };
        },
      },
      drafts: {
        list: async (input: any) => {
          captured.draftsList = input;
          return { data: { drafts: [{ id: 'd1' }], nextPageToken: 'next' } };
        },
        get: async (input: any) => {
          captured.draftsGet = input;
          return { data: { id: input.id } };
        },
        create: async (input: any) => {
          captured.draftsCreate = input;
          return { data: { id: 'draft-1' } };
        },
        update: async (input: any) => {
          captured.draftsUpdate = input;
          return { data: { id: input.id } };
        },
        send: async (input: any) => {
          captured.draftsSend = input;
          return { data: { id: 'sent-msg' } };
        },
        delete: async (input: any) => {
          captured.draftsDelete = input;
          return { data: {} };
        },
      },
      threads: {
        list: async (input: any) => {
          captured.threadsList = input;
          return { data: { threads: [{ id: 't1' }], nextPageToken: 'tnext' } };
        },
        get: async (input: any) => {
          captured.threadsGet = input;
          return { data: { id: input.id } };
        },
        modify: async (input: any) => {
          captured.threadsModify = input;
          return { data: { id: input.id } };
        },
        trash: async (input: any) => {
          captured.threadsTrash = input;
          return { data: { id: input.id } };
        },
        delete: async (input: any) => {
          captured.threadsDelete = input;
          return { data: {} };
        },
      },
    },
  } as unknown as GmailApiLike;

  return new GmailService({} as never, new CacheManager(), 'me@example.com', gmailApi);
}

test('createDraft builds raw message and posts to drafts.create', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const id = await service.createDraft({ to: 'dest@example.com', subject: 'Hi', body: 'Body' });
  assert.equal(id, 'draft-1');
  assert.ok(captured.draftsCreate.requestBody.message.raw, 'raw should be defined');
});

test('handleCreateDraft accepts args without to/subject (draft WIP)', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const result = await service.handleCreateDraft({ body: 'WIP body' });
  assert.match(result.content[0].text, /Draft created successfully/);
  assert.ok(captured.draftsCreate.requestBody.message.raw, 'raw should be defined');
});

test('updateDraft builds raw message and forwards id to drafts.update', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const id = await service.updateDraft('d-7', { to: 'dest@example.com', subject: 'Hi', body: 'Body' });
  assert.equal(id, 'd-7');
  assert.equal(captured.draftsUpdate.id, 'd-7');
  assert.ok(captured.draftsUpdate.requestBody.message.raw, 'raw should be defined');
});

test('handleUpdateDraft accepts args without to/subject', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const result = await service.handleUpdateDraft({ draftId: 'd-8', body: 'WIP body' });
  assert.match(result.content[0].text, /Draft updated successfully/);
  assert.equal(captured.draftsUpdate.id, 'd-8');
});

test('handleDeleteThread forwards thread id to threads.delete', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const result = await service.handleDeleteThread({ threadId: 't-3' });
  assert.match(result.content[0].text, /permanently deleted/);
  assert.equal(captured.threadsDelete.id, 't-3');
});

test('sendDraft posts draft id to drafts.send', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const id = await service.sendDraft('d-9');
  assert.equal(id, 'sent-msg');
  assert.deepEqual(captured.draftsSend.requestBody, { id: 'd-9' });
});

test('listDrafts and listThreads return collections with pageToken', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  const drafts = await service.listDrafts({ query: 'x' });
  assert.deepEqual(drafts, { drafts: [{ id: 'd1' }], nextPageToken: 'next' });
  const threads = await service.listThreads({ labelIds: ['INBOX'] });
  assert.deepEqual(threads, { threads: [{ id: 't1' }], nextPageToken: 'tnext' });
  assert.deepEqual(captured.threadsList.labelIds, ['INBOX']);
});

test('modifyThread forwards add/remove label ids', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await service.modifyThread('t-1', { addLabelIds: ['L1'], removeLabelIds: ['L2'] });
  assert.deepEqual(captured.threadsModify.requestBody, { addLabelIds: ['L1'], removeLabelIds: ['L2'] });
});

test('archiveEmail removes INBOX label via messages.modify', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await service.archiveEmail('m-1');
  assert.deepEqual(captured.messagesModify.requestBody, { removeLabelIds: ['INBOX'] });
});

test('deleteEmailPermanently calls messages.delete', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await service.deleteEmailPermanently('m-2');
  assert.equal(captured.messagesDelete.id, 'm-2');
});

test('deleteThread calls threads.delete', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await service.deleteThread('t-2');
  assert.equal(captured.threadsDelete.id, 't-2');
});
