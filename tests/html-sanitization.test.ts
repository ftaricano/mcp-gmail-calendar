import test from 'node:test';
import assert from 'node:assert/strict';

import { EmailParser } from '../src/utils/EmailParser.js';
import { validateHtmlContent } from '../src/utils/Validator.js';

const MALICIOUS_HTML = '<p>hi</p><script>alert(1)</script>';

function buildHtmlMessage(html: string) {
  return {
    id: 'm1',
    threadId: 't1',
    labelIds: [],
    snippet: '',
    payload: {
      headers: [{ name: 'Subject', value: 'test' }],
      mimeType: 'text/html',
      body: { data: Buffer.from(html, 'utf-8').toString('base64url') },
    },
  };
}

function withEnv(value: string | undefined, fn: () => void) {
  const original = process.env.ENABLE_HTML_SANITIZATION;
  if (value === undefined) {
    delete process.env.ENABLE_HTML_SANITIZATION;
  } else {
    process.env.ENABLE_HTML_SANITIZATION = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env.ENABLE_HTML_SANITIZATION;
    } else {
      process.env.ENABLE_HTML_SANITIZATION = original;
    }
  }
}

test('EmailParser sanitizes HTML when ENABLE_HTML_SANITIZATION is unset (secure by default)', () => {
  withEnv(undefined, () => {
    const parser = new EmailParser();
    const email = parser.parseGmailMessage(buildHtmlMessage(MALICIOUS_HTML));
    assert.ok(email.bodyHtml !== undefined);
    assert.ok(!email.bodyHtml!.includes('<script>'), 'script tag must be stripped by default');
  });
});

test('EmailParser sanitizes HTML when ENABLE_HTML_SANITIZATION="true"', () => {
  withEnv('true', () => {
    const parser = new EmailParser();
    const email = parser.parseGmailMessage(buildHtmlMessage(MALICIOUS_HTML));
    assert.ok(!email.bodyHtml!.includes('<script>'));
  });
});

test('EmailParser passes HTML through only when ENABLE_HTML_SANITIZATION="false" (explicit opt-out)', () => {
  withEnv('false', () => {
    const parser = new EmailParser();
    const email = parser.parseGmailMessage(buildHtmlMessage(MALICIOUS_HTML));
    assert.ok(email.bodyHtml!.includes('<script>'), 'opt-out keeps raw HTML');
  });
});

test('validateHtmlContent enforces checks when ENABLE_HTML_SANITIZATION is unset (secure by default)', () => {
  withEnv(undefined, () => {
    assert.equal(validateHtmlContent('<script>alert(1)</script>'), false);
    assert.equal(validateHtmlContent('<p>safe</p>'), true);
  });
});

test('validateHtmlContent enforces checks when ENABLE_HTML_SANITIZATION="true"', () => {
  withEnv('true', () => {
    assert.equal(validateHtmlContent('<script>alert(1)</script>'), false);
  });
});

test('validateHtmlContent skips checks only when ENABLE_HTML_SANITIZATION="false"', () => {
  withEnv('false', () => {
    assert.equal(validateHtmlContent('<script>alert(1)</script>'), true);
  });
});
