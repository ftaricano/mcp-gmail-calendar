import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocsCreatePayload,
  buildSheetsValuesPayload,
  normalizeDocsExportMimeType,
} from '../src/cli/parsers.js';

test('docs export mime type aliases normalize to Google-supported types', () => {
  assert.equal(normalizeDocsExportMimeType('pdf'), 'application/pdf');
  assert.equal(normalizeDocsExportMimeType('txt'), 'text/plain');
});

test('docs create payload keeps title and optional content', () => {
  assert.deepEqual(buildDocsCreatePayload('Spec', 'hello'), { title: 'Spec', content: 'hello' });
});

test('sheets values payload parses matrix json', () => {
  assert.deepEqual(buildSheetsValuesPayload([['a', 1], ['b', 2]], 'USER_ENTERED'), {
    values: [['a', '1'], ['b', '2']],
    valueInputOption: 'USER_ENTERED',
  });
});
