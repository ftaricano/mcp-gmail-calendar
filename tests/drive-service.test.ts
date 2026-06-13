import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DriveService } from '../src/services/DriveService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

test('drive service upload forwards metadata and media to injected api', async () => {
  let request: unknown;
  const service = new DriveService({} as never, new CacheManager(), 'me@example.com', {
    files: {
      list: async () => ({ data: { files: [] } }),
      get: async () => ({ data: { id: 'file-1' } }),
      create: async (input: unknown) => {
        request = input;
        return { data: { id: 'file-1', name: 'report.txt' } };
      },
    },
    permissions: {
      create: async () => ({ data: { id: 'perm-1' } }),
    },
  });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gws-drive-'));
  const filePath = path.join(dir, 'report.txt');
  await fs.writeFile(filePath, 'hello world');

  try {
    const result = await service.uploadFile({ path: filePath, name: 'report.txt', mimeType: 'text/plain' });
    assert.deepEqual(result, { id: 'file-1', name: 'report.txt' });
    const uploadRequest = request as {
      requestBody: { name: string; parents?: string[]; mimeType: string };
      media: { mimeType: string; body: { path?: string } };
      fields: string;
    };
    assert.deepEqual(uploadRequest.requestBody, { name: 'report.txt', parents: undefined, mimeType: 'text/plain' });
    assert.equal(uploadRequest.media.mimeType, 'text/plain');
    assert.equal(uploadRequest.media.body.path, filePath);
    assert.equal(uploadRequest.fields, 'id,name,mimeType,webViewLink,parents,modifiedTime,size');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
