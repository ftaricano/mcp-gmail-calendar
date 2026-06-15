import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgram } from '../src/cli/program.js';
import { runCli } from './cli-test-helpers.js';

test('sheets add-sheet dry-run emits would envelope and skips the service', async () => {
  let called = false;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'sheets', 'add-sheet', 'sheet-1', '--title', 'NewTab', '--rows', '50', '--columns', '8',
  ], {
    services: {
      sheets: async () => ({
        getSpreadsheet: async () => ({}),
        getValues: async () => ({}),
        updateValues: async () => ({}),
        appendValues: async () => ({}),
        batchUpdate: async () => { called = true; return {}; },
        addSheet: async () => { called = true; return {}; },
        deleteSheet: async () => { called = true; return {}; },
        renameSheet: async () => { called = true; return {}; },
        clearValues: async () => { called = true; return {}; },
      }),
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(called, false);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'sheets.addSheet', spreadsheetId: 'sheet-1', title: 'NewTab', rows: 50, columns: 8 },
  });
});

test('sheets delete-sheet dry-run reports destructive intent and skips the service', async () => {
  let called = false;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'sheets', 'delete-sheet', 'sheet-1', '--sheet-id', '4',
  ], {
    services: {
      sheets: async () => ({
        getSpreadsheet: async () => ({}),
        getValues: async () => ({}),
        updateValues: async () => ({}),
        appendValues: async () => ({}),
        batchUpdate: async () => { called = true; return {}; },
        addSheet: async () => { called = true; return {}; },
        deleteSheet: async () => { called = true; return {}; },
        renameSheet: async () => { called = true; return {}; },
        clearValues: async () => { called = true; return {}; },
      }),
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(called, false);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'sheets.deleteSheet', spreadsheetId: 'sheet-1', sheetId: 4 },
  });
});

test('sheets rename-sheet dry-run envelope', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'sheets', 'rename-sheet', 'sheet-1', '--sheet-id', '2', '--title', 'Renamed',
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'sheets.renameSheet', spreadsheetId: 'sheet-1', sheetId: 2, title: 'Renamed' },
  });
});

test('sheets clear dry-run envelope', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'sheets', 'clear', 'sheet-1', '--range', 'Sheet1!A1:B2',
  ]);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'sheets.clear', spreadsheetId: 'sheet-1', range: 'Sheet1!A1:B2' },
  });
});

test('sheets batch-update dry-run echoes parsed requests and skips the service', async () => {
  let called = false;
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'sheets', 'batch-update', 'sheet-1', '--requests', '[{"deleteSheet":{"sheetId":1}}]',
  ], {
    services: {
      sheets: async () => ({
        getSpreadsheet: async () => ({}),
        getValues: async () => ({}),
        updateValues: async () => ({}),
        appendValues: async () => ({}),
        batchUpdate: async () => { called = true; return {}; },
        addSheet: async () => { called = true; return {}; },
        deleteSheet: async () => { called = true; return {}; },
        renameSheet: async () => { called = true; return {}; },
        clearValues: async () => { called = true; return {}; },
      }),
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(called, false);
  assert.deepEqual(JSON.parse(result.stdout), {
    account: 'me@example.com',
    dryRun: true,
    would: { action: 'sheets.batchUpdate', spreadsheetId: 'sheet-1', requests: [{ deleteSheet: { sheetId: 1 } }] },
  });
});

test('sheets batch-update with malformed JSON reports a clear validation error', async () => {
  const result = await runCli(createProgram, [
    '--account', 'me@example.com', '--dry-run',
    'sheets', 'batch-update', 'sheet-1', '--requests', '{not json',
  ]);

  assert.notEqual(result.exitCode, 0);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.error.type, 'ValidationCliError');
  assert.match(payload.error.message, /requests must be valid JSON/);
});
