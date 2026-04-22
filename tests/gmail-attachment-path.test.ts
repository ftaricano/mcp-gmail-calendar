import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildAttachmentDownloadPath, GmailService } from '../src/services/GmailService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

test('buildAttachmentDownloadPath keeps downloads inside the account sandbox and strips traversal', () => {
  const originalDir = process.env.ATTACHMENT_DOWNLOAD_DIR;
  process.env.ATTACHMENT_DOWNLOAD_DIR = path.join(os.tmpdir(), 'gmail-download-root');

  try {
    const result = buildAttachmentDownloadPath('User.Name+tag@example.com', '../../../../../escape.txt');

    assert.equal(result.accountDir, path.join(result.downloadRoot, 'user.name+tag@example.com'));
    assert.equal(result.resolvedPath, path.join(result.accountDir, 'escape.txt'));
    assert.ok(result.resolvedPath.startsWith(result.accountDir));
  } finally {
    if (originalDir === undefined) {
      delete process.env.ATTACHMENT_DOWNLOAD_DIR;
    } else {
      process.env.ATTACHMENT_DOWNLOAD_DIR = originalDir;
    }
  }
});

test('handleDownloadAttachment writes sanitized filenames into the per-account sandbox directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-attachment-test-'));
  const originalDir = process.env.ATTACHMENT_DOWNLOAD_DIR;
  process.env.ATTACHMENT_DOWNLOAD_DIR = tempRoot;

  try {
    const service = new GmailService({} as never, new CacheManager(), 'Casey.User@example.com');
    const payload = Buffer.from('attachment payload');

    (service as any).getAttachment = async () => payload;
    (service as any).getAttachmentInfo = async () => ({ filename: '../invoice.pdf' });

    const response = await service.handleDownloadAttachment({
      messageId: 'msg-1',
      attachmentId: 'att-1',
      savePath: '../nested/../../report.txt',
    });

    const savedPath = response.content[0]?.type === 'text'
      ? response.content[0].text.replace('Attachment saved to sandbox path: ', '')
      : '';

    assert.equal(savedPath, path.join(tempRoot, 'casey.user@example.com', 'report.txt'));
    assert.equal(await fs.readFile(savedPath, 'utf8'), payload.toString('utf8'));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });

    if (originalDir === undefined) {
      delete process.env.ATTACHMENT_DOWNLOAD_DIR;
    } else {
      process.env.ATTACHMENT_DOWNLOAD_DIR = originalDir;
    }
  }
});
