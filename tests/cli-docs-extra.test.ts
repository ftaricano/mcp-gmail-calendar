import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { createFakeServices, runCli } from './cli-test-helpers.js';
import type { CliServiceFactories, DocsServiceLike } from '../src/cli/program.js';

function trackingDocs(): { calls: string[]; services: Partial<CliServiceFactories> } {
  const calls: string[] = [];
  const docs: DocsServiceLike = {
    getDocument: async (documentId: string) => ({ documentId }),
    exportDocument: async (_id: string, mimeType: string, outputPath: string) => ({ mimeType, path: outputPath, size: 1 }),
    createDocument: async (title: string) => ({ documentId: 'doc-1', title }),
    batchUpdate: async (documentId: string) => {
      calls.push('batchUpdate');
      return { documentId };
    },
    insertText: async (documentId: string) => {
      calls.push('insertText');
      return { documentId };
    },
    replaceAllText: async (documentId: string) => {
      calls.push('replaceAllText');
      return { documentId };
    },
    insertTable: async (documentId: string) => {
      calls.push('insertTable');
      return { documentId };
    },
    insertImage: async (documentId: string) => {
      calls.push('insertImage');
      return { documentId };
    },
  };

  return { calls, services: { ...createFakeServices(), docs: async () => docs } };
}

test('docs insert-text dry-run emits envelope and skips service', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'docs', 'insert-text', 'doc-1', '--text', 'hello', '--index', '3',
  ], { services: tracker.services });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'docs.insert-text', documentId: 'doc-1', text: 'hello', index: 3 },
  });
  assert.deepEqual(tracker.calls, []);
});

test('docs replace-text dry-run emits envelope and skips service', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'docs', 'replace-text', 'doc-1', '--find', 'a', '--replace', 'b', '--match-case',
  ], { services: tracker.services });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'docs.replace-text',
      documentId: 'doc-1',
      replacements: [{ find: 'a', replace: 'b', matchCase: true }],
    },
  });
  assert.deepEqual(tracker.calls, []);
});

test('docs insert-table dry-run emits envelope and skips service', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'docs', 'insert-table', 'doc-1', '--rows', '2', '--columns', '3',
  ], { services: tracker.services });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'docs.insert-table', documentId: 'doc-1', rows: 2, columns: 3, index: 1 },
  });
  assert.deepEqual(tracker.calls, []);
});

test('docs insert-image dry-run emits envelope and skips service', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'docs', 'insert-image', 'doc-1', '--uri', 'https://example.com/i.png',
  ], { services: tracker.services });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'docs.insert-image', documentId: 'doc-1', uri: 'https://example.com/i.png', index: 1 },
  });
  assert.deepEqual(tracker.calls, []);
});

test('docs batch-update dry-run emits envelope and skips service', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'docs', 'batch-update', 'doc-1', '--requests', '[{"insertText":{"location":{"index":1},"text":"x"}}]',
  ], { services: tracker.services });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: {
      action: 'docs.batch-update',
      documentId: 'doc-1',
      requests: [{ insertText: { location: { index: 1 }, text: 'x' } }],
    },
  });
  assert.deepEqual(tracker.calls, []);
});

test('docs insert-text without dry-run calls the service', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'docs', 'insert-text', 'doc-1', '--text', 'hello',
  ], { services: tracker.services });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(tracker.calls, ['insertText']);
});

test('docs batch-update with malformed JSON fails with a clear message', async () => {
  const tracker = trackingDocs();
  const result = await runCli(createProgram, [
    '--account', 'me@example.com',
    'docs', 'batch-update', 'doc-1', '--requests', '{not json',
  ], { services: tracker.services });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /--requests must be valid JSON/);
  assert.deepEqual(tracker.calls, []);
});
