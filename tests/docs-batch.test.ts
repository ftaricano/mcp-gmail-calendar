import test from 'node:test';
import assert from 'node:assert/strict';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { DocsService } from '../src/services/DocsService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

interface BatchUpdateCall {
  documentId: string;
  requestBody: { requests: unknown[] };
}

function createService(): { service: DocsService; calls: BatchUpdateCall[] } {
  const calls: BatchUpdateCall[] = [];
  const service = new DocsService(
    {} as never,
    new CacheManager(),
    'me@example.com',
    {
      documents: {
        get: async () => ({ data: { documentId: 'doc-1', title: 'Doc' } }),
        create: async () => ({ data: { documentId: 'doc-1' } }),
        batchUpdate: async (input: BatchUpdateCall) => {
          calls.push(input);
          return { data: { documentId: input.documentId, replies: [] } };
        },
      },
    } as never,
    { files: {} } as never,
  );
  return { service, calls };
}

test('insertText forwards an insertText request to batchUpdate', async () => {
  const { service, calls } = createService();
  await service.insertText('doc-1', 'hello', 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].documentId, 'doc-1');
  assert.deepEqual(calls[0].requestBody.requests, [
    { insertText: { location: { index: 5 }, text: 'hello' } },
  ]);
});

test('insertText defaults index to 1', async () => {
  const { service, calls } = createService();
  await service.insertText('doc-1', 'hi');
  assert.deepEqual(calls[0].requestBody.requests, [
    { insertText: { location: { index: 1 }, text: 'hi' } },
  ]);
});

test('replaceAllText emits one replaceAllText request per replacement', async () => {
  const { service, calls } = createService();
  await service.replaceAllText('doc-1', [
    { find: 'a', replace: 'b' },
    { find: 'c', replace: 'd', matchCase: true },
  ]);
  assert.deepEqual(calls[0].requestBody.requests, [
    { replaceAllText: { containsText: { text: 'a', matchCase: false }, replaceText: 'b' } },
    { replaceAllText: { containsText: { text: 'c', matchCase: true }, replaceText: 'd' } },
  ]);
});

test('insertTable forwards an insertTable request', async () => {
  const { service, calls } = createService();
  await service.insertTable('doc-1', 2, 3, 4);
  assert.deepEqual(calls[0].requestBody.requests, [
    { insertTable: { location: { index: 4 }, rows: 2, columns: 3 } },
  ]);
});

test('insertImage forwards an insertInlineImage request', async () => {
  const { service, calls } = createService();
  await service.insertImage('doc-1', 'https://example.com/img.png', 7);
  assert.deepEqual(calls[0].requestBody.requests, [
    { insertInlineImage: { location: { index: 7 }, uri: 'https://example.com/img.png' } },
  ]);
});

test('batchUpdate forwards raw requests verbatim', async () => {
  const { service, calls } = createService();
  const requests = [{ updateTextStyle: { range: { startIndex: 1, endIndex: 2 } } }];
  await service.batchUpdate('doc-1', requests as never);
  assert.deepEqual(calls[0].requestBody.requests, requests);
});

test('handleInsertText rejects invalid args with McpError', async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.handleInsertText({ text: 'no document id' }),
    (error: unknown) => error instanceof McpError,
  );
});

test('handleInsertText happy path returns content envelope', async () => {
  const { service, calls } = createService();
  const result = await service.handleInsertText({ documentId: 'doc-1', text: 'hi', index: 2 });
  assert.equal(calls.length, 1);
  assert.equal(result.content[0].type, 'text');
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.documentId, 'doc-1');
});
