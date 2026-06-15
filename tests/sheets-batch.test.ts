import test from 'node:test';
import assert from 'node:assert/strict';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { SheetsService } from '../src/services/SheetsService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

interface CapturedBatch {
  spreadsheetId?: string;
  requestBody?: { requests?: unknown[] };
}

interface CapturedClear {
  spreadsheetId?: string;
  range?: string;
}

function makeService(capture: {
  batch?: (input: CapturedBatch) => void;
  clear?: (input: CapturedClear) => void;
}): SheetsService {
  return new SheetsService({} as never, new CacheManager(), 'me@example.com', {
    spreadsheets: {
      get: async () => ({ data: {} }),
      batchUpdate: async (input: CapturedBatch) => {
        capture.batch?.(input);
        return { data: { spreadsheetId: input.spreadsheetId, replies: [{}] } };
      },
      values: {
        get: async () => ({ data: {} }),
        update: async () => ({ data: {} }),
        append: async () => ({ data: {} }),
        clear: async (input: CapturedClear) => {
          capture.clear?.(input);
          return { data: { spreadsheetId: input.spreadsheetId, clearedRange: input.range } };
        },
      },
    } as never,
  });
}

test('addSheet sends an addSheet request with gridProperties', async () => {
  let captured: CapturedBatch | undefined;
  const service = makeService({ batch: (input) => { captured = input; } });
  await service.addSheet('sheet-1', 'NewTab', { rows: 100, columns: 12 });
  assert.equal(captured?.spreadsheetId, 'sheet-1');
  assert.deepEqual(captured?.requestBody?.requests, [
    { addSheet: { properties: { title: 'NewTab', gridProperties: { rowCount: 100, columnCount: 12 } } } },
  ]);
});

test('addSheet omits gridProperties when no dimensions given', async () => {
  let captured: CapturedBatch | undefined;
  const service = makeService({ batch: (input) => { captured = input; } });
  await service.addSheet('sheet-1', 'Plain');
  assert.deepEqual(captured?.requestBody?.requests, [
    { addSheet: { properties: { title: 'Plain' } } },
  ]);
});

test('deleteSheet sends a deleteSheet request', async () => {
  let captured: CapturedBatch | undefined;
  const service = makeService({ batch: (input) => { captured = input; } });
  await service.deleteSheet('sheet-1', 42);
  assert.deepEqual(captured?.requestBody?.requests, [{ deleteSheet: { sheetId: 42 } }]);
});

test('renameSheet sends updateSheetProperties with fields=title', async () => {
  let captured: CapturedBatch | undefined;
  const service = makeService({ batch: (input) => { captured = input; } });
  await service.renameSheet('sheet-1', 7, 'Renamed');
  assert.deepEqual(captured?.requestBody?.requests, [
    { updateSheetProperties: { properties: { sheetId: 7, title: 'Renamed' }, fields: 'title' } },
  ]);
});

test('clearValues calls values.clear with the range', async () => {
  let captured: CapturedClear | undefined;
  const service = makeService({ clear: (input) => { captured = input; } });
  await service.clearValues('sheet-1', 'Sheet1!A1:B2');
  assert.deepEqual(captured, { spreadsheetId: 'sheet-1', range: 'Sheet1!A1:B2' });
});

test('batchUpdate forwards raw requests unchanged', async () => {
  let captured: CapturedBatch | undefined;
  const service = makeService({ batch: (input) => { captured = input; } });
  const requests = [{ repeatCell: { range: { sheetId: 0 }, cell: {}, fields: '*' } }];
  await service.batchUpdate('sheet-1', requests);
  assert.deepEqual(captured?.requestBody?.requests, requests);
});

test('addSheet invalidates the cached spreadsheet', async () => {
  const cache = new CacheManager();
  cache.setAccountCache('me@example.com', 'sheets:get:sheet-1', { cached: true });
  const service = new SheetsService({} as never, cache, 'me@example.com', {
    spreadsheets: {
      get: async () => ({ data: {} }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async () => ({ data: {} }),
        update: async () => ({ data: {} }),
        append: async () => ({ data: {} }),
        clear: async () => ({ data: {} }),
      },
    } as never,
  });
  await service.addSheet('sheet-1', 'Tab');
  assert.equal(cache.getAccountCache('me@example.com', 'sheets:get:sheet-1'), undefined);
});

test('handleAddSheet rejects missing title with McpError', async () => {
  const service = makeService({});
  await assert.rejects(
    () => service.handleAddSheet({ spreadsheetId: 'sheet-1' }),
    (error: unknown) => {
      assert.ok(error instanceof McpError);
      return true;
    },
  );
});

test('handleDeleteSheet returns JSON content on happy path', async () => {
  const service = makeService({});
  const result = await service.handleDeleteSheet({ spreadsheetId: 'sheet-1', sheetId: 3 });
  assert.equal(result.content[0].type, 'text');
  const payload = JSON.parse(result.content[0].text as string);
  assert.equal(payload.spreadsheetId, 'sheet-1');
});
