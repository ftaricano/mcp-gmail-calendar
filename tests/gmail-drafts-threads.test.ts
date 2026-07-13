import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GmailService, type GmailApiLike } from '../src/services/GmailService.js';
import { CacheManager } from '../src/utils/CacheManager.js';

function decodeRaw(raw: string): string {
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

// buildEmailMessage base64-encodes each MIME body part inside the raw message.
// Fully decode the raw, then decode every base64 body block so assertions can
// match against the human-readable rendered content.
function decodeRawWithBodies(raw: string): string {
  const outer = decodeRaw(raw);
  return outer.replace(/(Content-Transfer-Encoding: base64\r\n\r\n)([\s\S]*?)(?=\r\n--|$)/g, (_m, header, block) => {
    const decoded = Buffer.from(block.replace(/\r\n/g, ''), 'base64').toString('utf-8');
    return `${header}${decoded}`;
  });
}

function makeService(captured: Record<string, any>): GmailService {
  const gmailApi = {
    users: {
      messages: {
        modify: async (input: any) => {
          captured.messagesModify = input;
          return { data: { id: input.id } };
        },
        send: async (input: any) => {
          captured.messagesSend = input;
          return { data: { id: 'sent-msg' } };
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

test('handleCreateDraft rejects a numeric threadId', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await assert.rejects(
    () => service.handleCreateDraft({ body: 'WIP', threadId: 123 }),
    (err: any) => {
      assert.equal(err.name, 'McpError');
      assert.match(err.message, /Invalid arguments/);
      return true;
    },
  );
  assert.equal(captured.draftsCreate, undefined, 'API must not be called for invalid threadId');
});

test('createDraft renders templateId into the raw body (not empty)', async () => {
  const captured: Record<string, any> = {};

  // Register a template in an isolated temp dir to avoid touching repo templates.
  // TemplateEngine binds templatesPath from process.env at construction, so the
  // env must be set BEFORE makeService() builds the service (the test runner loads
  // every file in one process and interleaves async bodies — constructing first
  // would race a concurrent file mutating TEMPLATE_PATH and capture ./templates).
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-tpl-'));
  const prevPath = process.env.TEMPLATE_PATH;
  process.env.TEMPLATE_PATH = tmpDir;
  const service = makeService(captured);
  try {
    await service.templateEngine.createTemplate(
      'draft_tpl',
      '<p>Hello {{recipientName}}, your code is {{code}}</p>',
      'test template',
      { requiredVariables: ['recipientName', 'code'] },
    );

    await service.createDraft({
      to: 'dest@example.com',
      subject: 'Tpl',
      templateId: 'draft_tpl',
      templateData: { recipientName: 'Ferd', code: 'ABC123' },
    });

    const raw = captured.draftsCreate.requestBody.message.raw;
    assert.ok(raw, 'raw should be defined');
    const decoded = decodeRawWithBodies(raw);
    assert.ok(decoded.includes('text/html'), 'draft should carry an HTML part');
    assert.ok(decoded.includes('Hello Ferd'), 'rendered template content must appear in raw body');
    assert.ok(decoded.includes('ABC123'), 'rendered template data must appear in raw body');
  } finally {
    if (prevPath === undefined) delete process.env.TEMPLATE_PATH;
    else process.env.TEMPLATE_PATH = prevPath;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('createDraft with bodyHtml produces a non-empty HTML body in raw', async () => {
  const captured: Record<string, any> = {};

  // wrapInDefaultTemplate needs the default professional_basic template available.
  // Set TEMPLATE_PATH before makeService() so the engine binds the temp dir at
  // construction (see note in the templateId test above — shared-env race).
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-tpl-'));
  const prevPath = process.env.TEMPLATE_PATH;
  process.env.TEMPLATE_PATH = tmpDir;
  const service = makeService(captured);
  try {
    await service.templateEngine.initialize();

    await service.createDraft({
      to: 'dest@example.com',
      subject: 'Html draft',
      bodyHtml: '<p>UNIQUE_DRAFT_MARKER</p>',
    });

    const raw = captured.draftsCreate.requestBody.message.raw;
    assert.ok(raw, 'raw should be defined');
    const decoded = decodeRawWithBodies(raw);
    assert.ok(decoded.includes('text/html'), 'draft should carry an HTML part');
    assert.ok(decoded.includes('UNIQUE_DRAFT_MARKER'), 'bodyHtml content must appear in raw body');
  } finally {
    if (prevPath === undefined) delete process.env.TEMPLATE_PATH;
    else process.env.TEMPLATE_PATH = prevPath;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('handleModifyThread rejects when no labels are provided', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await assert.rejects(
    () => service.handleModifyThread({ threadId: 't-1' }),
    (err: any) => {
      assert.equal(err.name, 'McpError');
      assert.match(err.message, /Invalid arguments/);
      return true;
    },
  );
  assert.equal(captured.threadsModify, undefined, 'API must not be called for a no-op modify');
});

test('handleModifyThread rejects when both label arrays are empty', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await assert.rejects(
    () => service.handleModifyThread({ threadId: 't-1', addLabelIds: [], removeLabelIds: [] }),
    (err: any) => err.name === 'McpError',
  );
  assert.equal(captured.threadsModify, undefined);
});

test('handleSendEmail rejects when cc is an invalid type', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await assert.rejects(
    () => service.handleSendEmail({ to: 'dest@example.com', subject: 'Hi', cc: 123 }),
    (err: any) => {
      assert.equal(err.name, 'McpError');
      assert.match(err.message, /Invalid arguments/);
      return true;
    },
  );
});

test('handleSendEmail rejects attachments missing filename/content', async () => {
  const captured: Record<string, any> = {};
  const service = makeService(captured);
  await assert.rejects(
    () => service.handleSendEmail({
      to: 'dest@example.com',
      subject: 'Hi',
      attachments: [{ filename: 'a.txt' }],
    }),
    (err: any) => err.name === 'McpError',
  );
});

// Outbound HTML screening (FIX 1): validateHtmlContent is wired into the shared
// buildEmailMessage choke point, so dangerous HTML is rejected before the MIME is
// base64url-encoded — on both the send and the draft paths. The default template
// wraps bodyHtml via {{{content}}} (raw, unescaped), so a <script> in bodyHtml
// would otherwise ship verbatim; these tests prove it is blocked.
// Build the service INSIDE this helper, after the env vars are set, so the
// TemplateEngine (which reads TEMPLATE_PATH at construction) binds the temp dir.
// Constructing before setting the env would race a concurrent test file mutating
// the same shared globals and capture ./templates. prevSanitize is restored in
// finally so the delete below never leaks into other interleaved files.
async function withInitializedTemplates(
  captured: Record<string, any>,
  fn: (service: GmailService) => Promise<void>,
) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-sec-'));
  const prevPath = process.env.TEMPLATE_PATH;
  const prevSanitize = process.env.ENABLE_HTML_SANITIZATION;
  process.env.TEMPLATE_PATH = tmpDir;
  // Secure-by-default: ensure screening is active regardless of ambient env.
  delete process.env.ENABLE_HTML_SANITIZATION;
  try {
    await fn(makeService(captured));
  } finally {
    if (prevPath === undefined) delete process.env.TEMPLATE_PATH;
    else process.env.TEMPLATE_PATH = prevPath;
    if (prevSanitize === undefined) delete process.env.ENABLE_HTML_SANITIZATION;
    else process.env.ENABLE_HTML_SANITIZATION = prevSanitize;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test('sendEmail rejects outbound bodyHtml containing <script> before hitting the API', async () => {
  const captured: Record<string, any> = {};
  await withInitializedTemplates(captured, async (service) => {
    await service.templateEngine.initialize();
    await assert.rejects(
      () => service.sendEmail({
        to: 'dest@example.com',
        subject: 'XSS',
        bodyHtml: '<p>hi</p><script>alert(1)</script>',
      }),
      (err: any) => {
        assert.match(err.message, /Outbound HTML rejected/);
        return true;
      },
    );
    assert.equal(captured.messagesSend, undefined, 'send API must not be called for rejected HTML');
  });
});

test('createDraft rejects outbound bodyHtml containing <script> before hitting the API', async () => {
  const captured: Record<string, any> = {};
  await withInitializedTemplates(captured, async (service) => {
    await service.templateEngine.initialize();
    await assert.rejects(
      () => service.createDraft({
        to: 'dest@example.com',
        subject: 'XSS',
        bodyHtml: '<p>hi</p><script>alert(1)</script>',
      }),
      (err: any) => {
        assert.match(err.message, /Outbound HTML rejected/);
        return true;
      },
    );
    assert.equal(captured.draftsCreate, undefined, 'drafts.create must not be called for rejected HTML');
  });
});
