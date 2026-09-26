# mcp-google-workspace — Google Workspace CLI + MCP

Status: beta

`gwcli` is a CLI-first Google Workspace tool for local automation. It exposes Gmail, Google Calendar, Google Drive, Google Docs, and Google Sheets workflows from the terminal, with the existing MCP server available as `mcp-google-workspace` for assistant clients.

The direction is deliberate: the CLI is the primary product surface; MCP is a compatibility adapter.

## What it includes today

- `gwcli` CLI binary for account, config, Gmail, Calendar, Drive, Docs, Sheets, and local diagnostics
- `mcp-google-workspace` binary preserving the existing stdio MCP server (`gws-mcp` kept as a legacy alias)
- OAuth2 for personal Gmail and Google Workspace accounts
- Multi-account state via `~/.config/gws/state.json`
- JSON-first output for scripts, plus table/jsonl/tsv formats
- Gmail list/search/read/send/reply/forward/delete/archive/labels/drafts/threads/attachments/read-status commands
- Calendar list/upcoming/search/freebusy/create/update/delete/respond/quickadd/conference/instances commands, plus secondary calendar create/delete
- Drive list/get/upload/download/mkdir/share/trash/restore/copy/batch-delete/revisions/shared-drives/shortcut commands (full CLI↔MCP parity)
- Docs get/export/create plus insert-text/replace-text/insert-table/insert-image/batch-update commands (CLI↔MCP parity via `documents.batchUpdate`)
- Sheets get/values (get/update/append)/add-sheet/delete-sheet/rename-sheet/clear/batch-update commands
- Tasks task-list and task list/get/create/update/complete/move/delete commands
- Contacts (People) list/search/get/create/update/delete and contact-group list/get commands
- Existing MCP toolset for Gmail, Calendar, attachments, templates, and Sheets

## Migrating from `gws` (2.0.0)

Version 2.0.0 renames the binaries. The old `gws` name collided with Google's official Workspace CLI.

| Before | Now |
|---|---|
| `gws` | `gwcli` |
| `gws-mcp` | `mcp-google-workspace` (`gws-mcp` still works as an alias) |
| `@mcp/gmail-calendar` | `@ftaricano/mcp-google-workspace` |

The config directory (`~/.config/gws`) and the `GWS_*` environment variables are unchanged, so existing accounts and tokens keep working. Run `npm link` again from the new checkout to install `gwcli`.

## Install

```bash
git clone https://github.com/ftaricano/mcp-google-workspace.git
cd mcp-google-workspace
npm install
npm run build
npm link
```

Prerequisites:

- Node.js 20+
- Google Cloud OAuth credentials
- Google APIs enabled for the surfaces you use:
  - Gmail API
  - Google Calendar API
  - Google Drive API
  - Google Docs API
  - Google Sheets API
  - Google Tasks API
  - Google People API

If you already authenticated before Drive/Docs/Sheets support existed, run `gwcli auth login --account you@example.com --type workspace` again so Google grants the expanded OAuth scopes.

> **⚠️ Tasks requires re-consent.** Google Tasks adds a brand-new OAuth scope (`https://www.googleapis.com/auth/tasks`). Any account authenticated before Tasks support existed must re-run `gwcli auth login --account you@example.com --type workspace` to grant it. Without re-consent, every Tasks call returns HTTP 403. `gwcli auth login` detects when a stored account is missing a current scope and re-triggers the Google consent screen automatically (it is no longer a no-op for already-known accounts).

> **⚠️ Contacts requires re-consent.** Google People / Contacts adds a brand-new OAuth scope (`https://www.googleapis.com/auth/contacts`). Any account authenticated before Contacts support existed must re-run `gwcli auth login --account you@example.com --type workspace` to grant it. Without re-consent, every Contacts call returns HTTP 403. As with Tasks, `gwcli auth login` auto-detects the missing scope and re-triggers the Google consent screen.

Configure environment:

```bash
cp .env.example .env
```

Set at least:

```env
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/credentials.json
TOKENS_PATH=/absolute/path/to/tokens
OAUTH_CALLBACK_PORT=3000
LOG_LEVEL=info
```

## CLI quickstart

Authenticate:

```bash
gwcli auth login --account you@example.com --type workspace
```

List accounts:

```bash
gwcli auth list
```

Set the default account:

```bash
gwcli auth switch you@example.com
```

Show current account:

```bash
gwcli auth current
```

Inspect CLI paths:

```bash
gwcli config path
```

Set config values:

```bash
gwcli config set timezone America/Sao_Paulo
gwcli config list
```

Run local diagnostics without printing secrets:

```bash
gwcli doctor --format json
```

## Gmail examples

List recent mail:

```bash
gwcli mail list --query "is:unread" --limit 10
```

Read and search:

```bash
gwcli mail read MESSAGE_ID
gwcli mail search "from:client@example.com has:attachment" --limit 20
```

Send, reply, forward:

```bash
gwcli mail send --to client@example.com --subject "Proposal" --body "Attached." --attachment ./proposal.pdf
gwcli mail reply MESSAGE_ID --body "Recebido, obrigado."
gwcli mail forward MESSAGE_ID --to teammate@example.com --body "Please review."
```

Archive and delete:

```bash
gwcli mail archive MESSAGE_ID
gwcli mail delete MESSAGE_ID  # move to trash
```

Drafts:

```bash
gwcli mail drafts list --query "is:draft" --limit 10
gwcli mail drafts get DRAFT_ID
gwcli mail drafts create --to client@example.com --subject "Proposal" --body "Draft body"
gwcli mail drafts send DRAFT_ID
gwcli mail drafts delete DRAFT_ID
```

Threads:

```bash
gwcli mail threads list --query "from:client@example.com" --label INBOX --limit 10
gwcli mail threads get THREAD_ID
gwcli mail threads modify THREAD_ID --add-label LABEL_ID --remove-label INBOX
gwcli mail threads trash THREAD_ID
```

Dry-run destructive or mutating actions:

```bash
gwcli --dry-run mail delete MESSAGE_ID
gwcli --dry-run mail archive MESSAGE_ID
gwcli --dry-run mail drafts create --to client@example.com --subject "Proposal" --body "Draft body"
gwcli --dry-run mail drafts send DRAFT_ID
gwcli --dry-run mail threads modify THREAD_ID --add-label LABEL_ID
gwcli --dry-run mail mark-read MESSAGE_ID
```

Labels and attachments:

```bash
gwcli mail labels
gwcli mail labels create "Clients"
gwcli mail labels add MESSAGE_ID LABEL_ID
gwcli mail labels remove MESSAGE_ID LABEL_ID

gwcli mail attachments list MESSAGE_ID
gwcli mail attachments download MESSAGE_ID ATTACHMENT_ID --output ./downloads/file.pdf
```

Legacy aliases remain available:

```bash
gwcli mail attachments-list MESSAGE_ID
gwcli mail attachment-download MESSAGE_ID ATTACHMENT_ID --output ./downloads/file.pdf
```

## Calendar examples

List calendars and events:

```bash
gwcli cal calendars
gwcli cal events upcoming --days 7 --limit 10
gwcli cal events list --from 2026-05-01T00:00:00-03:00 --to 2026-05-08T00:00:00-03:00
gwcli cal events search "planning" --limit 5
```

Secondary calendars (create is mutating, delete is destructive — both support `--dry-run`):

```bash
gwcli --dry-run cal calendars create --summary "Project X" --description "Tracking" --timezone America/Sao_Paulo
gwcli cal calendars create --summary "Project X"
gwcli --dry-run cal calendars delete CALENDAR_ID
```

Recurring event occurrences (read-only):

```bash
gwcli cal events instances RECURRING_EVENT_ID --from 2026-05-01T00:00:00-03:00 --to 2026-06-01T00:00:00-03:00 --limit 20
```

Each instance returned by `cal events instances` has its own `id`. To edit or delete a **single occurrence**, pass that instance id to the regular update/delete commands — the Calendar API treats each instance as an independent event:

```bash
gwcli cal events update INSTANCE_ID --summary "Moved this one only"
gwcli cal events delete INSTANCE_ID
```

Create and update events:

```bash
gwcli cal events create --summary "Client call" --start 2026-05-03T10:00:00-03:00 --end 2026-05-03T11:00:00-03:00 --attendee client@example.com --meet

gwcli cal events update EVENT_ID --summary "Updated title" --send-notifications
```

Free/busy, invitation response, quick add, Meet conference:

```bash
gwcli cal freebusy --from 2026-05-01T00:00:00-03:00 --to 2026-05-02T00:00:00-03:00 --calendar primary

gwcli --dry-run cal events respond EVENT_ID --response accepted --comment "Confirmado"
gwcli cal events quickadd "Lunch with Ana tomorrow noon"
gwcli cal events conference EVENT_ID --type hangoutsMeet
```

## Drive examples

```bash
gwcli drive list --query "mimeType != 'application/vnd.google-apps.folder'" --limit 20
gwcli drive get FILE_ID
gwcli --dry-run drive upload --path ./proposal.pdf --name "Proposal.pdf" --parent FOLDER_ID
gwcli drive download FILE_ID --output ./downloads/proposal.pdf
gwcli drive mkdir "Client Docs" --parent PARENT_FOLDER_ID
gwcli --dry-run drive share FILE_ID --role reader --type user --email client@example.com
gwcli --dry-run drive trash FILE_ID
gwcli --dry-run drive restore FILE_ID
gwcli --dry-run drive copy FILE_ID --name "Copy.pdf" --parent FOLDER_ID
gwcli --dry-run drive batch-delete FILE_ID_1 FILE_ID_2 FILE_ID_3
gwcli --dry-run drive shortcut TARGET_FILE_ID --name "Shortcut" --parent FOLDER_ID
gwcli drive revisions FILE_ID
gwcli drive shared-drives --limit 20
```

Allowed Drive share roles: `reader`, `commenter`, `writer`.

Allowed Drive share types: `user`, `group`, `domain`, `anyone`.

`drive trash`, `drive restore`, `drive copy`, `drive batch-delete`, and `drive shortcut` are mutating and support `--dry-run`. For safety, `drive trash` and `drive batch-delete` move files to the Drive trash (recoverable) rather than deleting permanently; `batch-delete` continues past per-file errors and reports a per-id status. `drive revisions` and `drive shared-drives` are read-only.

## Docs examples

```bash
gwcli docs get DOCUMENT_ID
gwcli docs export DOCUMENT_ID --mime-type pdf --output ./doc.pdf
gwcli docs create --title "Meeting Notes" --content "Initial notes"
gwcli --dry-run docs insert-text DOCUMENT_ID --text "Appended line" --index 1
gwcli --dry-run docs replace-text DOCUMENT_ID --find "{{name}}" --replace "Ada" --match-case
gwcli --dry-run docs insert-table DOCUMENT_ID --rows 3 --columns 2 --index 1
gwcli --dry-run docs insert-image DOCUMENT_ID --uri https://example.com/logo.png --index 1
gwcli --dry-run docs batch-update DOCUMENT_ID --requests '[{"insertText":{"location":{"index":1},"text":"raw"}}]'
```

Export MIME aliases include `pdf`, `docx`, `txt`, and `html`.

The edit commands (`insert-text`, `replace-text`, `insert-table`, `insert-image`, `batch-update`)
are mutating and support `--dry-run`, returning a `{ "dryRun": true, "would": ... }` envelope. They
are backed by Google Docs `documents.batchUpdate`; `batch-update` accepts a raw request array for
operations not covered by the typed helpers (text styling, paragraph formatting, etc.).

## Sheets examples

```bash
gwcli sheets get SPREADSHEET_ID
gwcli sheets values SPREADSHEET_ID --range "Sheet1!A1:C10"
gwcli --dry-run sheets update SPREADSHEET_ID --range "Sheet1!A1:B2" --values '[["a","b"],["c","d"]]' --value-input-option USER_ENTERED
gwcli sheets append SPREADSHEET_ID --range "Sheet1!A:B" --values '[["new","row"]]'
gwcli --dry-run sheets add-sheet SPREADSHEET_ID --title "Q3" --rows 200 --columns 12
gwcli --dry-run sheets rename-sheet SPREADSHEET_ID --sheet-id 0 --title "Summary"
gwcli --dry-run sheets delete-sheet SPREADSHEET_ID --sheet-id 123456
gwcli --dry-run sheets clear SPREADSHEET_ID --range "Sheet1!A1:Z100"
gwcli --dry-run sheets batch-update SPREADSHEET_ID --requests '[{"repeatCell":{"range":{"sheetId":0},"cell":{"userEnteredFormat":{"textFormat":{"bold":true}}},"fields":"userEnteredFormat.textFormat.bold"}}]'
```

Allowed value input options: `RAW`, `USER_ENTERED`.

Formulas are written through the regular `values update`/`values append` commands with
`--value-input-option USER_ENTERED`, which tells Sheets to parse formulas and numbers
instead of storing literal strings. `add-sheet`, `delete-sheet`, `rename-sheet`, `clear`,
and `batch-update` are mutating and support `--dry-run`, returning a
`{ "dryRun": true, "would": ... }` envelope. `batch-update` takes a raw JSON array of
Sheets API `Request` objects (formatting, data validation, conditional formatting, etc.);
malformed JSON fails with a clear `requests must be valid JSON` validation error.
## Tasks examples

> Tasks needs the `tasks` OAuth scope. If you authenticated before Tasks support existed, re-run `gwcli auth login --account you@example.com --type workspace` first, otherwise calls return 403.

```bash
gwcli tasks lists list
gwcli tasks lists get LIST_ID
gwcli --dry-run tasks lists create --title "Groceries"
gwcli --dry-run tasks lists update LIST_ID --title "Renamed"
gwcli --dry-run tasks lists delete LIST_ID

gwcli tasks list LIST_ID --show-completed --limit 50
gwcli tasks get LIST_ID TASK_ID
gwcli --dry-run tasks create LIST_ID --title "Buy milk" --notes "whole" --due 2026-06-20T00:00:00Z
gwcli --dry-run tasks update LIST_ID TASK_ID --title "New title" --status needsAction
gwcli --dry-run tasks complete LIST_ID TASK_ID
gwcli --dry-run tasks move LIST_ID TASK_ID --parent PARENT_ID --previous SIBLING_ID
gwcli --dry-run tasks delete LIST_ID TASK_ID
```

Allowed task status values: `needsAction`, `completed`.

## Contacts examples

> Contacts needs the `contacts` OAuth scope. If you authenticated before Contacts support existed, re-run `gwcli auth login --account you@example.com --type workspace` first, otherwise calls return 403.

```bash
gwcli contacts list --page-size 50
gwcli contacts search "Ada"
gwcli contacts get people/c123
gwcli --dry-run contacts create --json '{"names":[{"givenName":"Ada","familyName":"Lovelace"}],"emailAddresses":[{"value":"ada@example.com"}]}'
gwcli --dry-run contacts update people/c123 --json '{"names":[{"givenName":"Grace"}]}' --fields names
gwcli --dry-run contacts delete people/c123
gwcli contacts groups list
gwcli contacts groups get contactGroups/abc
```

The `--json` payload is a [People API `Person` resource](https://developers.google.com/people/api/rest/v1/people#Person). `contacts update` resolves the required `etag` automatically (it reuses `etag` from the payload when present, otherwise fetches the current one before patching).

## Output formats

Default output is JSON and stdout is kept data-only for successful commands.

```bash
gwcli mail list --format json
gwcli mail list --format table
gwcli mail list --format jsonl
gwcli mail list --format tsv
```

`yaml` is reserved but not bundled yet.

## Account resolution

Commands resolve the active account in this order:

1. `--account you@example.com`
2. `GWS_ACCOUNT` environment variable
3. `~/.config/gws/state.json` current account
4. first authenticated account
5. auth error

## Safety and automation conventions

- Mutating commands support `--dry-run` where practical and return `{ "dryRun": true, "would": ... }`.
- CLI output redacts token/secret-like values in error details.
- Attachment downloads preserve the existing account sandbox protections.
- Tests use injected fake services and do not require real Google credentials.

## MCP compatibility

The MCP server is available as `mcp-google-workspace` (the `gws-mcp` binary remains as a legacy alias) and preserves the current tool names.

Example MCP config:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "mcp-google-workspace",
      "env": {
        "GOOGLE_CREDENTIALS_PATH": "/absolute/path/to/credentials.json",
        "TOKENS_PATH": "/absolute/path/to/tokens",
        "OAUTH_CALLBACK_PORT": "3000"
      }
    }
  }
}
```

Existing direct path usage also works:

```bash
node /absolute/path/to/mcp-google-workspace/dist/index.js
```

## MCP tool groups

- Account: `authenticate`, `list_accounts`, `switch_account`, `remove_account`, `get_current_account`
- Gmail: `email_list`, `email_read`, `email_send`, `email_reply`, `email_forward`, `email_delete`, `email_mark_read`, `email_mark_unread`, `email_search`, labels, batch operations
- Attachments: `email_list_attachments`, `email_download_attachment`
- Calendar: `calendar_list`, `event_list`, `event_get`, `event_create`, `event_update`, `event_delete`, availability, invitation response, quick add, upcoming
- Drive: `drive_list`, `drive_get`, `drive_upload`, `drive_download`, `drive_mkdir`, `drive_share`, `drive_trash`, `drive_restore`, `drive_copy`, `drive_batch_delete`, `drive_revisions`, `drive_shared_drives`, `drive_shortcut`
- Templates: list, render, create
- Docs: `docs_get`, `docs_create`, `docs_export`, `docs_batch_update`, `docs_insert_text`, `docs_replace_text`, `docs_insert_table`, `docs_insert_image`
- Sheets: `sheets_get`, `sheets_values_get`, `sheets_values_update`, `sheets_values_append`, `sheets_batch_update`, `sheets_add_sheet`, `sheets_delete_sheet`, `sheets_rename_sheet`, `sheets_clear`

Docs has full CLI↔MCP parity: every `gwcli docs <command>` maps to a `docs_*` MCP tool with the same
underlying service method. Mutating MCP tools validate arguments with zod and reject malformed input
with `InvalidParams`; the CLI exposes the same operations behind `--dry-run`.

Drive now has CLI↔MCP parity: every `gwcli drive` command has a matching `drive_*` MCP tool. As in the CLI, `drive_trash` and `drive_batch_delete` move files to the trash (recoverable) instead of deleting permanently.

The Sheets surface is at parity between the CLI (`gwcli sheets ...`) and MCP (`sheets_*`
tools): both cover values get/update/append, structural mutations (add/delete/rename
sheet), range clears, and raw `batchUpdate` requests. Use `--value-input-option
USER_ENTERED` (CLI) or `valueInputOption: "USER_ENTERED"` (MCP) to write formulas.
- Tasks: `tasks_lists_list`, `tasks_lists_get`, `tasks_lists_create`, `tasks_lists_update`, `tasks_lists_delete`, `tasks_list`, `tasks_get`, `tasks_create`, `tasks_update`, `tasks_complete`, `tasks_move`, `tasks_delete`
- Contacts (People): `people_contacts_list`, `people_contacts_search`, `people_contacts_get`, `people_contacts_create`, `people_contacts_update`, `people_contacts_delete`, `people_groups_list`, `people_groups_get`

## Development

```bash
npm run cli -- --help
npm run build
npm test
npm run lint
npm pack --dry-run --json
```

CI runs lint, build, and tests on Node 20 and 22.

## Roadmap

- Split the large CLI program into command modules as the command surface grows
- Expand People/Contacts support
- Add incremental OAuth scopes per Workspace surface
- Add richer Drive/Docs/Sheets operations after real-world CLI usage

## Security

See [SECURITY.md](SECURITY.md). Tokens stay local and are never printed by CLI account commands.
