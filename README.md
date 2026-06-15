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
- Gmail list/search/read/send/reply/forward/delete/archive/labels/drafts/threads/attachments/read-status commands
- Calendar list/upcoming/search/freebusy/create/update/delete/respond/quickadd/conference commands
- Drive list/get/upload/download/mkdir/share commands
- Docs get/export/create commands
- Sheets spreadsheet and values get/update/append commands
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

If you already authenticated before Drive/Docs/Sheets support existed, run `gws auth login --account you@example.com --type workspace` again so Google grants the expanded OAuth scopes.

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

Archive and delete:

```bash
gws mail archive MESSAGE_ID
gws mail delete MESSAGE_ID  # move to trash
```

Drafts:

```bash
gws mail drafts list --query "is:draft" --limit 10
gws mail drafts get DRAFT_ID
gws mail drafts create --to client@example.com --subject "Proposal" --body "Draft body"
gws mail drafts send DRAFT_ID
gws mail drafts delete DRAFT_ID
```

Threads:

```bash
gws mail threads list --query "from:client@example.com" --label INBOX --limit 10
gws mail threads get THREAD_ID
gws mail threads modify THREAD_ID --add-label LABEL_ID --remove-label INBOX
gws mail threads trash THREAD_ID
```

Dry-run destructive or mutating actions:

```bash
gws --dry-run mail delete MESSAGE_ID
gws --dry-run mail archive MESSAGE_ID
gws --dry-run mail drafts create --to client@example.com --subject "Proposal" --body "Draft body"
gws --dry-run mail drafts send DRAFT_ID
gws --dry-run mail threads modify THREAD_ID --add-label LABEL_ID
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
