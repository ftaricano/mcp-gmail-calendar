# CLI-first Google Workspace: 5 Sprint Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Builder lane: Codex ACP. Reviewer lane: Claude ACP.

**Goal:** Turn the repo from a Gmail/Calendar MCP server with a thin CLI into a complete CLI-first Google Workspace automation toolkit while preserving MCP compatibility.

**Architecture:** Keep service classes as Google API wrappers. Move CLI orchestration into focused command modules and shared parsers, so adding Drive/Docs/Sheets later does not bloat `src/cli/program.ts`. Add non-destructive dry-run behavior for mutating commands, machine-friendly output, and fixture-backed tests without requiring real Google credentials.

**Tech Stack:** TypeScript ESM, Node 20+, commander, googleapis, node:test/tsx, existing GmailService/CalendarService/AuthManager.

---

## Sprint 1 — CLI Architecture & UX Foundation

**Objective:** Refactor CLI into maintainable modules and add shared parsing/validation helpers.

**Files:**
- Create: `src/cli/commands/auth.ts`
- Create: `src/cli/commands/config.ts`
- Create: `src/cli/commands/mail.ts`
- Create: `src/cli/commands/calendar.ts`
- Create: `src/cli/options.ts`
- Create: `src/cli/parsers.ts`
- Modify: `src/cli/program.ts`
- Tests: `tests/cli-parsers.test.ts`, update existing CLI tests.

**Required behavior:**
- `createProgram()` remains public API.
- Commands remain backward-compatible with current names.
- Shared helpers parse positive integers, booleans, comma-separated email lists, JSON strings/files, and stdin marker `-`.
- Mutating commands must honor global `--dry-run` where feasible.

**Verification:**
- `npm run build`
- `npm test`
- `npm run lint`
- `node bin/gws.js --help`

---

## Sprint 2 — Gmail CLI Completeness

**Objective:** Expose the existing Gmail service surface through CLI commands, not just list/search/read.

**Files:**
- Modify: `src/cli/commands/mail.ts`
- Possibly create: `src/cli/mail-payloads.ts`
- Tests: `tests/cli-mail-commands.test.ts`, parser tests where useful.

**Required commands:**
- `gws mail profile`
- `gws mail send --to ... --subject ... --body ... [--cc ... --bcc ... --html] [--attachment path]`
- `gws mail reply <messageId> --body ...`
- `gws mail forward <messageId> --to ... --body ...`
- `gws mail delete <messageId>` with dry-run
- `gws mail mark-read <messageId>` with dry-run
- `gws mail mark-unread <messageId>` with dry-run
- `gws mail labels list`
- `gws mail labels create <name> [--background-color ... --text-color ...]`
- `gws mail labels add <messageId> <labelId>`
- `gws mail labels remove <messageId> <labelId>`
- `gws mail attachments list <messageId>`
- `gws mail attachments download <messageId> <attachmentId> --output <path>`

**Required behavior:**
- Output envelopes include `account` for account-scoped commands.
- Mutating commands output clear `{dryRun: true, would: ...}` without calling service.
- Attachment paths must keep existing sandbox protections.

**Verification:**
- Unit tests should exercise command registration and dry-run behavior without Google credentials by injecting fake services or command factories.

---

## Sprint 3 — Calendar CLI Completeness

**Objective:** Expose the full Calendar service surface through CLI commands.

**Files:**
- Modify: `src/cli/commands/calendar.ts`
- Create/update shared payload helpers if needed.
- Tests: `tests/cli-calendar-commands.test.ts`, parser tests.

**Required commands:**
- `gws cal events get <eventId> [--calendar primary]`
- `gws cal events create --summary ... --start ... --end ... [--attendee ...] [--description ...] [--location ...] [--meet]`
- `gws cal events update <eventId> [same patch fields]`
- `gws cal events delete <eventId> [--calendar ...] [--no-notify]`
- `gws cal freebusy --from ... --to ... --calendar ... [--timezone ...]`
- `gws cal respond <eventId> --status accepted|declined|tentative|needsAction [--comment ...]`
- `gws cal quick-add <text>`
- `gws cal search <query>`
- `gws cal events conference <eventId>`

**Required behavior:**
- Mutating commands support dry-run.
- Event payload parsing supports JSON via `--json`, `--json-file`, and flags.
- Timezone defaults to config/env.

**Verification:**
- Unit tests should cover payload construction and dry-run behavior.

---

## Sprint 4 — Workspace Expansion Scaffolding: Drive/Docs/Sheets

**Objective:** Add CLI-ready service scaffolding for broader Workspace without overbuilding full APIs.

**Files:**
- Create: `src/services/DriveService.ts`
- Create: `src/services/DocsService.ts`
- Create: `src/services/SheetsService.ts`
- Create: `src/cli/commands/drive.ts`
- Create: `src/cli/commands/docs.ts`
- Create: `src/cli/commands/sheets.ts`
- Modify: `src/cli/context.ts`, `src/cli/program.ts`, README.
- Tests: `tests/drive-service.test.ts`, `tests/docs-sheets-payloads.test.ts`, command smoke tests.

**Required initial commands:**
- Drive: `gws drive files list`, `get`, `upload`, `download`, `mkdir`, `share`
- Docs: `gws docs get`, `export`, `create`
- Sheets: `gws sheets get`, `values get`, `values update`, `values append`

**Required behavior:**
- Use existing Google OAuth client/scopes where possible; document scope expansion if needed.
- Tests must not hit Google APIs. Mock low-level API methods or validate payloads/helpers.
- Preserve package build and MCP compatibility.

---

## Sprint 5 — Automation Polish, Docs & Release Readiness

**Objective:** Make the CLI shippable and pleasant for local automation.

**Files:**
- Modify: `README.md`
- Create: `docs/cli-reference.md`
- Create: `docs/examples/*.md`
- Create/update: tests for help output and package smoke.
- Modify: `.github/workflows/ci.yml` if needed.

**Required behavior:**
- Full command reference with examples for Gmail, Calendar, Drive, Docs, Sheets.
- `gws --version` works from package metadata or generated constant.
- Add `gws doctor` to check config dir, credentials path, token dir permissions, and optional API availability without exposing secrets.
- Add package smoke test for `npm pack --dry-run` and bin existence.

**Verification:**
- `npm run build`
- `npm test`
- `npm run lint`
- `npm pack --dry-run --json`
- `node bin/gws.js --help`
- `node bin/gws.js doctor --format json` with isolated temp config.

---

## Implementation Rules

- Follow TDD where production behavior changes: write/adjust tests first, verify failure, implement, verify pass.
- Keep commits coherent. One final commit is acceptable if subagent cannot commit per sprint, but tests must pass before final commit.
- Do not remove MCP entrypoint or MCP tools.
- Do not introduce paid Anthropic API usage.
- Do not print secrets/tokens in errors, doctor output, logs, or docs.
- Prefer small helpers and command modules over growing `program.ts`.
- If scope expansion is needed for Drive/Docs/Sheets, document it in README and `.env.example`; avoid breaking existing Gmail/Calendar auth.
