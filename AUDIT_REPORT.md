# Audit Report: mcp-gmail-calendar

Audit date: 2026-05-23
Scope: Phase 1 read-only deep audit plus report generation. Source code was not modified.
Repository: `ftaricano/mcp-gmail-calendar`
Branch audited: `jarvis/cli-first-gws`

## Executive Summary

`mcp-gmail-calendar` is a TypeScript ESM project that now exposes a CLI-first Google Workspace surface (`gws`) and keeps a stdio MCP server (`gws-mcp`) for compatibility. The repository has a useful README, strict TypeScript, Node 20/22 CI, package smoke tests, and several targeted tests for CLI parsing, dry-run behavior, attachment path sandboxing, redaction helpers, and service payloads.

The audit found no confirmed Critical issue. The most important issues are:

- High: production dependency audit currently fails, with 1 high and 5 moderate production vulnerabilities.
- High: calendar invitation response logic patches every attendee's response status.
- Medium: Gmail replies do not actually preserve threading despite code setting thread-related fields.
- Medium: OAuth callback listener binds by port only instead of loopback.
- Medium: HTML sanitization defaults are inconsistent and effectively off unless an env var is explicitly set.
- Medium: logger error handling can write raw sensitive strings from `Error.message` and stack.

Validation commands completed:

- `npm run lint` - passed.
- `npm run build` - passed.
- `npm test` - passed, 33 tests.
- `npm pack --dry-run --json` - passed, 105 package entries.
- `gitleaks detect --source . --redact --no-banner --log-level error --exit-code 0` - passed with no stdout findings.
- `npm audit --omit=dev --json` - failed with production vulnerabilities; verbatim output is included under Dependency Health.

## Findings

### Critical

None confirmed.

### High

#### H1. Production dependency audit fails with high-severity transitive vulnerabilities

Evidence:

- `package-lock.json:13` quotes `"@modelcontextprotocol/sdk": "^1.29.0",`
- `package-lock.json:19` quotes `"googleapis": "^171.4.0",`
- `package-lock.json:25` quotes `"sanitize-html": "^2.14.0",`
- `package-lock.json:1735` quotes `"node_modules/@modelcontextprotocol/sdk": {`
- `package-lock.json:1750` quotes `"express-rate-limit": "^8.2.1",`
- `package-lock.json:1751` quotes `"hono": "^4.11.4",`
- `package-lock.json:4105` quotes `"version": "3.1.0",`
- `package-lock.json:4669` quotes `"version": "4.12.14",`
- `package-lock.json:6597` quotes `"version": "8.5.6",`

Impact: `npm audit --omit=dev --json` exits non-zero with 6 production vulnerabilities: 1 high (`fast-uri`) and 5 moderate (`express-rate-limit`, `hono`, `ip-address`, `postcss`, `qs`). The audit output says fixes are available. Reachability still needs runtime validation because some vulnerable packages come through SDK/server dependencies that may not be exercised by the stdio transport, but this is still a release blocker for a public package.

Recommended fix: update direct dependency ranges and lockfile so the production transitive graph resolves to fixed versions. Do this in a dedicated security PR, not the quick-wins branch, because it addresses a High finding.

#### H2. Calendar invitation response patches every attendee

Evidence:

- `src/services/CalendarService.ts:263` quotes `const attendees = event.attendees || [];`
- `src/services/CalendarService.ts:264` quotes `// This would need the current user's email to find and update their status`
- `src/services/CalendarService.ts:265` quotes `// For now, we'll use a placeholder approach`
- `src/services/CalendarService.ts:272` quotes `attendees: attendees.map(attendee => ({`
- `src/services/CalendarService.ts:274` quotes `responseStatus: response,`

Impact: `respondToInvitation()` does not identify the current user's attendee record. It maps every attendee and applies the same response to all of them, which can falsely accept/decline on behalf of other attendees and then sends notifications.

Recommended fix: fetch the authenticated account identity, patch only that attendee, and add a service-level unit test with at least two attendees proving only the current user changes. Do this in a dedicated correctness PR, not the quick-wins branch, because this is a High side-effect bug.

### Medium

#### M1. Gmail replies set threading fields that `sendEmail()` ignores

Evidence:

- `src/services/GmailService.ts:350` quotes `const messageIdHeader = response.data.payload?.headers?.find(h => h.name === 'Message-ID');`
- `src/services/GmailService.ts:352` quotes `// Need to modify buildEmailMessage to support these headers`
- `src/services/GmailService.ts:353` quotes `(replyOptions as any).inReplyTo = messageIdHeader.value;`
- `src/services/GmailService.ts:355` quotes `(replyOptions as any).threadId = originalEmail.threadId;`
- `src/services/GmailService.ts:227` quotes `const response = await this.gmail.users.messages.send({`
- `src/services/GmailService.ts:230` quotes `raw: message,`

Impact: reply metadata is attached to an `any` object but `buildEmailMessage()` does not emit `In-Reply-To` or `References`, and the Gmail send request does not include `threadId`. A `gws mail reply` or MCP `email_reply` can therefore send a new message instead of a threaded reply.

Recommended fix: extend `SendEmailOptions` and `buildEmailMessage()` to include `In-Reply-To` and `References`; pass `threadId` in the Gmail `users.messages.send` request body; add a unit test that inspects the raw RFC822 headers and request body.

#### M2. OAuth callback server is not explicitly loopback-bound

Evidence:

- `src/auth/GoogleAuthManager.ts:111` quotes ``const redirectUri = `http://localhost:${process.env.OAUTH_CALLBACK_PORT || 3000}/oauth2callback`;``
- `src/auth/GoogleAuthManager.ts:159` quotes `const server = http.createServer(async (req, res) => {`
- `src/auth/GoogleAuthManager.ts:231` quotes `server.listen(port, () => {`

Impact: the redirect URI is local, but `server.listen(port)` does not explicitly bind to `127.0.0.1` or `::1`. On Node, a port-only listen can expose the callback server on unspecified interfaces depending on platform defaults. The state check helps, but OAuth callback listeners should be loopback-only.

Recommended fix: use `server.listen(port, '127.0.0.1', ...)`, document the callback host, and add a test or smoke assertion around the listen options.

#### M3. HTML sanitization is documented as enabled by default but the parser defaults it off

Evidence:

- `src/utils/Validator.ts:21` quotes `ENABLE_HTML_SANITIZATION: z.string().optional().default('true'),`
- `src/utils/EmailParser.ts:13` quotes `this.enableHtmlSanitization = process.env.ENABLE_HTML_SANITIZATION === 'true';`
- `src/utils/EmailParser.ts:72` quotes `} else if (payload.mimeType === 'text/html') {`
- `src/utils/EmailParser.ts:73` quotes `body.html = this.sanitizeHtml(content);`

Impact: `envSchema` says the default is true, but it only parses values and does not mutate `process.env`. `EmailParser` therefore disables sanitization whenever `ENABLE_HTML_SANITIZATION` is unset. Gmail HTML then passes through to CLI/MCP consumers unless the user explicitly sets the variable.

Recommended fix: make the parser default secure with `process.env.ENABLE_HTML_SANITIZATION !== 'false'`, and add tests for unset, `true`, and `false`.

#### M4. Error logging can persist raw sensitive strings from `Error.message` and stack

Evidence:

- `src/utils/Logger.ts:29` quotes `export function sanitizeLogMeta(meta: unknown): unknown {`
- `src/utils/Logger.ts:42` quotes `if (value instanceof Error) {`
- `src/utils/Logger.ts:44` quotes `error: value.message,`
- `src/utils/Logger.ts:45` quotes `stack: value.stack,`
- `src/utils/Logger.ts:149` quotes `error(message: string, error?: any): void {`
- `src/utils/Logger.ts:151` quotes `this.logger.error(message, {`
- `src/utils/Logger.ts:152` quotes `error: error.message,`
- `src/utils/Logger.ts:153` quotes `stack: error.stack,`

Impact: metadata keys are redacted, but `Error.message` and `Error.stack` are copied directly. Third-party API errors can include bearer tokens, signed URLs, raw request URLs, or PII. This conflicts with the security goal of not printing secrets in logs.

Recommended fix: run `error.message` and `error.stack` through the same redaction path used by CLI error payloads, then add a regression test using a token-like URL or `Bearer ...` string inside an Error.

#### M5. Token directory is initially created without private permissions

Evidence:

- `src/auth/GoogleAuthManager.ts:54` quotes `this.tokensPath = process.env.TOKENS_PATH || './tokens';`
- `src/auth/GoogleAuthManager.ts:60` quotes `await fs.mkdir(this.tokensPath, { recursive: true });`
- `src/auth/GoogleAuthManager.ts:265` quotes ``const tokenPath = path.join(this.tokensPath, `${email}.json`);``
- `src/auth/GoogleAuthManager.ts:267` quotes `await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2), { mode: 0o600 });`
- `SECURITY.md:8` quotes `- Token files are written with mode `0600` where the platform supports POSIX permissions.`

Impact: token files are written as `0600`, but the token directory is created first with default permissions. On common umasks that means other local users can traverse/list the directory and learn account-email filenames even though token contents are private.

Recommended fix: create and chmod the token directory to `0700` during initialization, not only later during `saveTokens()`.

#### M6. MCP mutating handlers rely on `any` arguments instead of runtime validation

Evidence:

- `src/index.ts:225` quotes `private async handleToolCall(name: string, args: any): Promise<{ content: Array<TextContent | ImageContent> }> {`
- `src/index.ts:394` quotes `case 'email_send':`
- `src/index.ts:396` quotes `return await this.gmailService!.handleSendEmail(args);`
- `src/index.ts:470` quotes `case 'event_create':`
- `src/index.ts:472` quotes `return await this.calendarService!.handleCreateEvent(args);`
- `src/services/GmailService.ts:567` quotes `async handleSendEmail(args: any): Promise<{ content: Array<TextContent> }> {`
- `src/services/CalendarService.ts:445` quotes `async handleCreateEvent(args: any): Promise<{ content: Array<TextContent> }> {`

Impact: the tool schemas are published, but the server-side handlers accept `any` and pass values directly into mutating services. If a client sends malformed arguments, validation is left to downstream code or Google APIs. This weakens error messages and increases the chance of accidental side effects.

Recommended fix: add Zod or SDK-side schema validation at `handleToolCall()` boundaries for mutating tools first (`email_send`, `email_reply`, `event_create`, `event_update`, `event_delete`, `email_batch_operations`).

### Low

#### L1. ESLint is effectively parser-only and does not lint tests

Evidence:

- `eslint.config.js:9` quotes `files: ['src/**/*.ts'],`
- `eslint.config.js:22` quotes `rules: {},`
- `package.json:12` quotes `"lint": "eslint .",`

Impact: lint currently runs, but there are no recommended TypeScript rules and tests are outside the configured file pattern. This lets `any` usage, unused variables in tests, floating promises, and other common issues slip past CI.

Recommended fix: add a small TypeScript ESLint recommended rule set and include `tests/**/*.ts`, then tune only the rules that produce real noise.

#### L2. README/package metadata are close but not publication-complete

Evidence:

- `README.md:1` quotes `# gws — Google Workspace CLI + MCP`
- `README.md:3` quotes `Status: beta`
- `README.md:23` quotes `## Install`
- `README.md:285` quotes `## Development`
- `README.md:304` quotes `## Security`
- `package.json:31` quotes `"author": "",`
- `package.json:32` quotes `"license": "MIT",`
- `package.json:74` quotes `"files": [`
- `package.json:77` quotes `"README.md",`
- `package.json:78` quotes `"SECURITY.md"`

Impact: the README is useful, but it lacks badges, troubleshooting, contributing, a license section, and a root `LICENSE` file. The package author is blank. The package `files` list does not include a `LICENSE` file because none exists at root.

Recommended fix: handle in Phase 3 (`polish readme`): add MIT `LICENSE`, README badges, troubleshooting, contributing, license section, and package author metadata if Ferd wants it public.

#### L3. `gws` version is hard-coded and can drift from `package.json`

Evidence:

- `package.json:3` quotes `"version": "1.0.0",`
- `src/cli/runtime.ts:93` quotes `version: options.version ?? '1.0.0',`
- `tests/package-smoke.test.ts:64` quotes `test('gws-mcp version exits successfully without requiring Google credentials', async () => {`
- `tests/package-smoke.test.ts:69` quotes `assert.equal(result.stdout.trim(), packageJson.version);`

Impact: `gws-mcp --version` is tested against `package.json`, but `gws --version` uses a hard-coded fallback. The next release can drift if the package version changes and runtime version is not injected.

Recommended fix: make the CLI runtime read package metadata or a generated version constant, and add a package-smoke test for `node bin/gws.js --version`.

#### L4. CLI advertises YAML output but always throws for it

Evidence:

- `src/cli/program.ts:82` quotes `.option('-f, --format <format>', 'Output format: json, table, jsonl, tsv, yaml', 'json')`
- `src/cli/options.ts:13` quotes `if (['json', 'table', 'jsonl', 'tsv', 'yaml'].includes(value)) {`
- `src/cli/output/formatters.ts:58` quotes `case 'yaml':`
- `src/cli/output/formatters.ts:59` quotes `throw new Error('YAML output is not bundled yet. Use --format json, table, jsonl, or tsv.');`
- `README.md:231` quotes ``yaml` is reserved but not bundled yet.`

Impact: `--format yaml` is accepted during option parsing but fails at output time. That creates avoidable runtime errors for scripts.

Recommended fix: either remove `yaml` from accepted formats until bundled, or add a small YAML serializer dependency intentionally.

#### L5. Package smoke test does not exercise `npm pack --dry-run`

Evidence:

- `docs/plans/2026-05-01-five-sprint-cli-first-gws.md:146` quotes `- Add package smoke test for `npm pack --dry-run` and bin existence.`
- `README.md:292` quotes `npm pack --dry-run --json`
- `tests/package-smoke.test.ts:40` quotes `test('package metadata includes gws and gws-mcp bins', async () => {`
- `tests/package-smoke.test.ts:56` quotes `test('gws-mcp help exits successfully without requiring Google credentials', async () => {`

Impact: manual `npm pack --dry-run --json` passed during this audit, but the automated package smoke suite only checks package metadata and bin help/version behavior. Packaging regressions can slip until manual release checks.

Recommended fix: add a test or CI step that runs `npm pack --dry-run --json` and asserts expected package entries (`dist/`, `bin/`, `README.md`, `SECURITY.md`, and future `LICENSE`).

## Quick Wins

These are low-risk items suitable for a later `apply quick wins` branch. They intentionally exclude High findings.

1. Harden token directory permissions at `src/auth/GoogleAuthManager.ts:60`.
   Change initialization to create/chmod `tokensPath` as `0700`, and add a small test around directory mode where POSIX permissions are available.

2. Bind the OAuth callback to loopback at `src/auth/GoogleAuthManager.ts:231`.
   Change `server.listen(port, ...)` to `server.listen(port, '127.0.0.1', ...)`, and keep the redirect URI aligned.

3. Make HTML sanitization default secure at `src/utils/EmailParser.ts:13`.
   Use `process.env.ENABLE_HTML_SANITIZATION !== 'false'` and add tests for unset, true, and false.

4. Redact `Error.message` and `Error.stack` in `src/utils/Logger.ts:149`.
   Extend the existing redaction helper to cover token-like strings inside Error messages/stacks and add a regression test.

5. Fix advertised YAML behavior at `src/cli/program.ts:82`, `src/cli/options.ts:13`, and `src/cli/output/formatters.ts:58`.
   Either remove `yaml` from accepted formats until bundled or intentionally add YAML output support.

6. Add `npm pack --dry-run --json` coverage to `tests/package-smoke.test.ts:40`.
   Assert the package includes the bins and public docs while excluding local runtime data.

7. Include lint in the publish gate at `package.json:19`.
   Change `prepublishOnly` from `npm run build && npm test` to include `npm run lint` first.

## README Assessment

Strengths:

- Clear CLI-first positioning: `README.md:5` explains the CLI and MCP compatibility surfaces.
- Real clone URL and install commands: `README.md:26` uses `https://github.com/ftaricano/mcp-gmail-calendar.git`.
- Requirements include Node and Google API prerequisites: `README.md:33`.
- Useful examples cover Gmail, Calendar, Drive, Docs, Sheets, output formats, and MCP config.
- Security section links to `SECURITY.md` and states tokens stay local: `README.md:304`.
- Development section includes build/test/lint/pack commands: `README.md:285`.

Gaps:

- H1 is product-facing (`gws`) rather than the repository/project name expected by the checklist (`mcp-gmail-calendar` or `@mcp/gmail-calendar`).
- No badges are present after the H1.
- No root `LICENSE` file exists, although `package.json:32` declares MIT and GitHub reports MIT license metadata.
- No README License section links to a root license file.
- No Troubleshooting section covers likely issues: missing credentials file, OAuth callback port conflict, scope expansion after Drive/Docs/Sheets, token directory permissions, and `--format yaml`.
- No Contributing section with pre-PR checks.
- GitHub description is stale: `gh repo view` returns `Gmail and Google Calendar MCP Server integration`, but the README now describes a CLI-first Google Workspace tool with Drive, Docs, and Sheets.
- Topics are good but could add `cli`, `google-drive`, `google-docs`, `google-sheets`, and `oauth2`.
- No `CHANGELOG.md`; this is optional, but the package is versioned `1.0.0`.

Phase 3 (`polish readme`) should own README/LICENSE/GitHub metadata changes.

## Dependency Health

Package manager: npm with `package-lock.json` lockfile version 3.

Installed top-level package summary from `npm ls --depth=0`:

- Runtime: `@modelcontextprotocol/sdk@1.29.0`, `commander@12.1.0`, `google-auth-library@10.6.2`, `googleapis@171.4.0`, `handlebars@4.7.9`, `sanitize-html@2.17.0`, `winston@3.18.3`, `zod@3.25.76`.
- Tooling: TypeScript 5.9.3, ESLint 9.37.0, tsx 4.20.6, Jest packages still installed although tests use `node:test`.

`npm audit --omit=dev --json` output, verbatim:

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "express-rate-limit": {
      "name": "express-rate-limit",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "ip-address"
      ],
      "effects": [],
      "range": "8.0.1 - 8.5.0",
      "nodes": [
        "node_modules/express-rate-limit"
      ],
      "fixAvailable": true
    },
    "fast-uri": {
      "name": "fast-uri",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1117870,
          "name": "fast-uri",
          "dependency": "fast-uri",
          "title": "fast-uri vulnerable to path traversal via percent-encoded dot segments",
          "url": "https://github.com/advisories/GHSA-q3j6-qgpj-74h6",
          "severity": "high",
          "cwe": [
            "CWE-22"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N"
          },
          "range": "<=3.1.0"
        },
        {
          "source": 1117884,
          "name": "fast-uri",
          "dependency": "fast-uri",
          "title": "fast-uri vulnerable to host confusion via percent-encoded authority delimiters",
          "url": "https://github.com/advisories/GHSA-v39h-62p7-jpjc",
          "severity": "high",
          "cwe": [
            "CWE-436"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N"
          },
          "range": "<=3.1.1"
        }
      ],
      "effects": [],
      "range": "<=3.1.1",
      "nodes": [
        "node_modules/fast-uri"
      ],
      "fixAvailable": true
    },
    "hono": {
      "name": "hono",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1117915,
          "name": "hono",
          "dependency": "hono",
          "title": "Hono has CSS Declaration Injection via Style Object Values in JSX SSR",
          "url": "https://github.com/advisories/GHSA-qp7p-654g-cw7p",
          "severity": "moderate",
          "cwe": [
            "CWE-74",
            "CWE-116"
          ],
          "cvss": {
            "score": 4.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N"
          },
          "range": "<4.12.18"
        },
        {
          "source": 1118963,
          "name": "hono",
          "dependency": "hono",
          "title": "Hono has improper validation of NumericDate claims (exp, nbf, iat) in JWT verify()",
          "url": "https://github.com/advisories/GHSA-hm8q-7f3q-5f36",
          "severity": "low",
          "cwe": [
            "CWE-1284"
          ],
          "cvss": {
            "score": 3.8,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:N"
          },
          "range": "<4.12.18"
        },
        {
          "source": 1118964,
          "name": "hono",
          "dependency": "hono",
          "title": "Hono's Cache Middleware ignores Vary: Authorization / Vary: Cookie leading to cross-user cache leakage",
          "url": "https://github.com/advisories/GHSA-p77w-8qqv-26rm",
          "severity": "moderate",
          "cwe": [
            "CWE-524"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N"
          },
          "range": "<4.12.18"
        },
        {
          "source": 1118982,
          "name": "hono",
          "dependency": "hono",
          "title": "Hono: bodyLimit() can be bypassed for chunked / unknown-length requests",
          "url": "https://github.com/advisories/GHSA-9vqf-7f2p-gf9v",
          "severity": "moderate",
          "cwe": [
            "CWE-400"
          ],
          "cvss": {
            "score": 6.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N"
          },
          "range": "<4.12.16"
        },
        {
          "source": 1118983,
          "name": "hono",
          "dependency": "hono",
          "title": "hono/jsx has Unvalidated JSX Tag Names that May Allow HTML Injection",
          "url": "https://github.com/advisories/GHSA-69xw-7hcm-h432",
          "severity": "moderate",
          "cwe": [
            "CWE-74"
          ],
          "cvss": {
            "score": 4.7,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N"
          },
          "range": "<4.12.16"
        }
      ],
      "effects": [],
      "range": "<=4.12.17",
      "nodes": [
        "node_modules/hono"
      ],
      "fixAvailable": true
    },
    "ip-address": {
      "name": "ip-address",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1118827,
          "name": "ip-address",
          "dependency": "ip-address",
          "title": "ip-address has XSS in Address6 HTML-emitting methods",
          "url": "https://github.com/advisories/GHSA-v2v4-37r5-5v8g",
          "severity": "moderate",
          "cwe": [
            "CWE-79"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<=10.1.0"
        }
      ],
      "effects": [
        "express-rate-limit"
      ],
      "range": "<=10.1.0",
      "nodes": [
        "node_modules/ip-address"
      ],
      "fixAvailable": true
    },
    "postcss": {
      "name": "postcss",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1117015,
          "name": "postcss",
          "dependency": "postcss",
          "title": "PostCSS has XSS via Unescaped </style> in its CSS Stringify Output",
          "url": "https://github.com/advisories/GHSA-qx2v-qp2m-jg93",
          "severity": "moderate",
          "cwe": [
            "CWE-79"
          ],
          "cvss": {
            "score": 6.1,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"
          },
          "range": "<8.5.10"
        }
      ],
      "effects": [],
      "range": "<8.5.10",
      "nodes": [
        "node_modules/postcss"
      ],
      "fixAvailable": true
    },
    "qs": {
      "name": "qs",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1119502,
          "name": "qs",
          "dependency": "qs",
          "title": "qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefined entries in comma-format arrays when encodeValuesOnly is set",
          "url": "https://github.com/advisories/GHSA-q8mj-m7cp-5q26",
          "severity": "moderate",
          "cwe": [
            "CWE-476"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": ">=6.11.1 <=6.15.1"
        }
      ],
      "effects": [],
      "range": "6.11.1 - 6.15.1",
      "nodes": [
        "node_modules/qs"
      ],
      "fixAvailable": true
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 5,
      "high": 1,
      "critical": 0,
      "total": 6
    },
    "dependencies": {
      "prod": 216,
      "dev": 384,
      "optional": 29,
      "peer": 0,
      "peerOptional": 0,
      "total": 601
    }
  }
}
```

Additional dependency notes:

- Full `npm audit --json` also fails with 12 total vulnerabilities: 4 high and 8 moderate, including dev-only advisories for `minimatch`, `picomatch`, `flatted`, `brace-expansion`, `ajv`, and `js-yaml`.
- `npm explain fast-uri` traces `fast-uri@3.1.0` through `@modelcontextprotocol/sdk -> ajv` and `ajv-formats`.
- `npm explain hono` traces `hono@4.12.14` through `@modelcontextprotocol/sdk`.
- `npm ls fast-uri hono postcss qs express-rate-limit ip-address --omit=dev` shows `postcss@8.5.6` through `sanitize-html@2.17.0`, `qs@6.15.1` through `@modelcontextprotocol/sdk`, `googleapis`, and `express`.

Package health:

- `npm pack --dry-run --json` passed and produced `mcp-gmail-calendar-1.0.0.tgz` with 105 entries.
- Package includes `README.md`, `SECURITY.md`, `bin/`, `dist/`, and `package.json`.
- Package does not include a root `LICENSE` file because none exists.

Secret scanning:

- `gitleaks detect --source . --redact --no-banner --log-level error --exit-code 0` completed with no stdout findings.
- A targeted token-pattern `rg` scan over tracked non-env/non-log/non-token paths found placeholder/documentation references but no obvious tracked provider token values. `.env.example` contents were not opened due local security instructions.

## Test Coverage Assessment

What is covered:

- CLI parser helpers for positive integers, booleans, enums, email lists, JSON input, files, and stdin marker.
- CLI dry-run behavior for mail send and calendar create/respond.
- CLI command wiring for calendar search/conference and mail labels.
- Attachment download path sandboxing.
- Drive upload request shape.
- Docs/Sheets payload builders.
- Logger metadata redaction for sensitive keys.
- Package metadata and `gws-mcp` help/version smoke.

Coverage gaps:

- No service-level test for `CalendarService.respondToInvitation()` with multiple attendees.
- No test proving `GmailService.replyToEmail()` emits `In-Reply-To`, `References`, or Gmail `threadId`.
- No test for default HTML sanitization behavior when `ENABLE_HTML_SANITIZATION` is unset.
- No test for OAuth callback host binding.
- No test for token directory permissions.
- No test proving `Logger.error(new Error(...))` redacts token-like strings in messages/stacks.
- No package smoke test for `node bin/gws.js --version` against `package.json`.
- No automated `npm pack --dry-run --json` assertion in CI/tests.
- Tests use fake services and intentionally avoid real Google credentials, so Google API integration behavior remains unvalidated.

Validation results:

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed, 33 tests.
- `node bin/gws.js --version`: `1.0.0`.
- `node bin/gws-mcp.js --version`: `1.0.0`.
- `node bin/gws.js doctor --format json`: passed and returned config/state paths plus empty account state.

## Items Needing Runtime Validation

1. OAuth browser login with real Google credentials after any loopback binding change.
2. Gmail reply threading against a real thread: verify headers, Gmail `threadId`, and UI placement.
3. Calendar invitation response against a test calendar event with multiple attendees.
4. Dependency reachability: confirm whether `@modelcontextprotocol/sdk`'s Hono/Express-related vulnerable packages are reachable in this stdio-only MCP usage.
5. Email HTML handling in real MCP clients and terminal workflows, especially unsanitized HTML from hostile emails.
6. Google Drive public-share behavior, especially `--type anyone --role writer`.
7. Docs/Drive export/download output path expectations for human CLI users versus automation.
8. Package install from a clean temp project to confirm `gws`, `gws-mcp`, logs, token dirs, and version commands work outside the repo checkout.

