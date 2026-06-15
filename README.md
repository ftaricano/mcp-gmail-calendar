# gws — Google Workspace CLI + MCP

Status: beta

`gws` is a CLI-first Google Workspace tool for local automation. It exposes Gmail, Google Calendar, Google Drive, Google Docs, and Google Sheets workflows from the terminal, with the existing MCP server preserved as `gws-mcp` for assistant clients.

The direction is deliberate: the CLI is the primary product surface; MCP is a compatibility adapter.

## What it includes today

- `gws` CLI binary for account, config, Gmail, Calendar, Drive, Docs, Sheets, and local diagnostics
- `gws-mcp` binary preserving the existing stdio MCP server
- OAuth2 for personal Gmail and Google Workspace accounts
- Multi-account state via `~/.config/gws/state.json`
- JSON-first output for scripts, plus table/jsonl/tsv formats
- Gmail list/search/read/send/reply/forward/delete/labels/attachments/read-status commands
- Calendar list/upcoming/search/freebusy/create/update/delete/respond/quickadd/conference commands
- Drive list/get/upload/download/mkdir/share commands
- Docs get/export/create commands
- Sheets spreadsheet and values get/update/append commands
- Tasks task-list and task list/get/create/update/complete/move/delete commands
- Contacts (People) list/search/get/create/update/delete and contact-group list/get commands
- Existing MCP toolset for Gmail, Calendar, attachments, and templates

## Install

```bash
git clone https://github.com/ftaricano/mcp-gmail-calendar.git
cd mcp-gmail-calendar
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

If you already authenticated before Drive/Docs/Sheets support existed, run `gws auth login --account you@example.com --type workspace` again so Google grants the expanded OAuth scopes.

> **⚠️ Tasks requires re-consent.** Google Tasks adds a brand-new OAuth scope (`https://www.googleapis.com/auth/tasks`). Any account authenticated before Tasks support existed must re-run `gws auth login --account you@example.com --type workspace` to grant it. Without re-consent, every Tasks call returns HTTP 403. `gws auth login` detects when a stored account is missing a current scope and re-triggers the Google consent screen automatically (it is no longer a no-op for already-known accounts).

> **⚠️ Contacts requires re-consent.** Google People / Contacts adds a brand-new OAuth scope (`https://www.googleapis.com/auth/contacts`). Any account authenticated before Contacts support existed must re-run `gws auth login --account you@example.com --type workspace` to grant it. Without re-consent, every Contacts call returns HTTP 403. As with Tasks, `gws auth login` auto-detects the missing scope and re-triggers the Google consent screen.

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
gws auth login --account you@example.com --type workspace
```

List accounts:

```bash
gws auth list
```

Set the default account:

```bash
gws auth switch you@example.com
```

Show current account:

```bash
gws auth current
```

Inspect CLI paths:

```bash
gws config path
```

Set config values:

```bash
gws config set timezone America/Sao_Paulo
gws config list
```

Run local diagnostics without printing secrets:

```bash
gws doctor --format json
```

## Gmail examples

List recent mail:

```bash
gws mail list --query "is:unread" --limit 10
```

Read and search:

```bash
gws mail read MESSAGE_ID
gws mail search "from:client@example.com has:attachment" --limit 20
```

Send, reply, forward:

```bash
gws mail send --to client@example.com --subject "Proposal" --body "Attached." --attachment ./proposal.pdf
gws mail reply MESSAGE_ID --body "Recebido, obrigado."
gws mail forward MESSAGE_ID --to teammate@example.com --body "Please review."
```

Dry-run destructive or mutating actions:

```bash
gws --dry-run mail delete MESSAGE_ID
gws --dry-run mail mark-read MESSAGE_ID
```

Labels and attachments:

```bash
gws mail labels
gws mail labels create "Clients"
gws mail labels add MESSAGE_ID LABEL_ID
gws mail labels remove MESSAGE_ID LABEL_ID

gws mail attachments list MESSAGE_ID
gws mail attachments download MESSAGE_ID ATTACHMENT_ID --output ./downloads/file.pdf
```

Legacy aliases remain available:

```bash
gws mail attachments-list MESSAGE_ID
gws mail attachment-download MESSAGE_ID ATTACHMENT_ID --output ./downloads/file.pdf
```

## Calendar examples

List calendars and events:

```bash
gws cal calendars
gws cal events upcoming --days 7 --limit 10
gws cal events list --from 2026-05-01T00:00:00-03:00 --to 2026-05-08T00:00:00-03:00
gws cal events search "planning" --limit 5
```

Create and update events:

```bash
gws cal events create --summary "Client call" --start 2026-05-03T10:00:00-03:00 --end 2026-05-03T11:00:00-03:00 --attendee client@example.com --meet

gws cal events update EVENT_ID --summary "Updated title" --send-notifications
```

Free/busy, invitation response, quick add, Meet conference:

```bash
gws cal freebusy --from 2026-05-01T00:00:00-03:00 --to 2026-05-02T00:00:00-03:00 --calendar primary

gws --dry-run cal events respond EVENT_ID --response accepted --comment "Confirmado"
gws cal events quickadd "Lunch with Ana tomorrow noon"
gws cal events conference EVENT_ID --type hangoutsMeet
```

## Drive examples

```bash
gws drive list --query "mimeType != 'application/vnd.google-apps.folder'" --limit 20
gws drive get FILE_ID
gws --dry-run drive upload ./proposal.pdf --name "Proposal.pdf" --parent FOLDER_ID
gws drive download FILE_ID --output ./downloads/proposal.pdf
gws drive mkdir "Client Docs" --parent PARENT_FOLDER_ID
gws --dry-run drive share FILE_ID --role reader --type user --email client@example.com
```

Allowed Drive share roles: `reader`, `commenter`, `writer`.

Allowed Drive share types: `user`, `group`, `domain`, `anyone`.

## Docs examples

```bash
gws docs get DOCUMENT_ID
gws docs export DOCUMENT_ID --mime-type pdf --output ./doc.pdf
gws docs create "Meeting Notes" --content "Initial notes"
```

Export MIME aliases include `pdf`, `docx`, `txt`, and `html`.

## Sheets examples

```bash
gws sheets get SPREADSHEET_ID
gws sheets values get SPREADSHEET_ID "Sheet1!A1:C10"
gws --dry-run sheets values update SPREADSHEET_ID "Sheet1!A1:B2" --values '[["a","b"],["c","d"]]' --value-input-option USER_ENTERED
gws sheets values append SPREADSHEET_ID "Sheet1!A:B" --values '[["new","row"]]'
```

Allowed value input options: `RAW`, `USER_ENTERED`.

## Tasks examples

> Tasks needs the `tasks` OAuth scope. If you authenticated before Tasks support existed, re-run `gws auth login --account you@example.com --type workspace` first, otherwise calls return 403.

```bash
gws tasks lists list
gws tasks lists get LIST_ID
gws --dry-run tasks lists create --title "Groceries"
gws --dry-run tasks lists update LIST_ID --title "Renamed"
gws --dry-run tasks lists delete LIST_ID

gws tasks list LIST_ID --show-completed --limit 50
gws tasks get LIST_ID TASK_ID
gws --dry-run tasks create LIST_ID --title "Buy milk" --notes "whole" --due 2026-06-20T00:00:00Z
gws --dry-run tasks update LIST_ID TASK_ID --title "New title" --status needsAction
gws --dry-run tasks complete LIST_ID TASK_ID
gws --dry-run tasks move LIST_ID TASK_ID --parent PARENT_ID --previous SIBLING_ID
gws --dry-run tasks delete LIST_ID TASK_ID
```

Allowed task status values: `needsAction`, `completed`.

## Contacts examples

> Contacts needs the `contacts` OAuth scope. If you authenticated before Contacts support existed, re-run `gws auth login --account you@example.com --type workspace` first, otherwise calls return 403.

```bash
gws contacts list --page-size 50
gws contacts search "Ada"
gws contacts get people/c123
gws --dry-run contacts create --json '{"names":[{"givenName":"Ada","familyName":"Lovelace"}],"emailAddresses":[{"value":"ada@example.com"}]}'
gws --dry-run contacts update people/c123 --json '{"names":[{"givenName":"Grace"}]}' --fields names
gws --dry-run contacts delete people/c123
gws contacts groups list
gws contacts groups get contactGroups/abc
```

The `--json` payload is a [People API `Person` resource](https://developers.google.com/people/api/rest/v1/people#Person). `contacts update` resolves the required `etag` automatically (it reuses `etag` from the payload when present, otherwise fetches the current one before patching).

## Output formats

Default output is JSON and stdout is kept data-only for successful commands.

```bash
gws mail list --format json
gws mail list --format table
gws mail list --format jsonl
gws mail list --format tsv
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

The MCP server is still available as `gws-mcp` and preserves the current tool names.

Example MCP config:

```json
{
  "mcpServers": {
    "gmail-calendar": {
      "command": "gws-mcp",
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
node /absolute/path/to/mcp-gmail-calendar/dist/index.js
```

## MCP tool groups

- Account: `authenticate`, `list_accounts`, `switch_account`, `remove_account`, `get_current_account`
- Gmail: `email_list`, `email_read`, `email_send`, `email_reply`, `email_forward`, `email_delete`, `email_mark_read`, `email_mark_unread`, `email_search`, labels, batch operations
- Attachments: `email_list_attachments`, `email_download_attachment`
- Calendar: `calendar_list`, `event_list`, `event_get`, `event_create`, `event_update`, `event_delete`, availability, invitation response, quick add, upcoming
- Templates: list, render, create
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
