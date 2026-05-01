# gws — Google Workspace CLI + MCP

Status: beta

`gws` is a CLI-first Google Workspace tool for local automation. It currently wraps Gmail and Google Calendar workflows, with the existing MCP server preserved as `gws-mcp` for assistant clients.

The direction is deliberate: the CLI is the primary product surface; MCP is a compatibility adapter.

## What it includes today

- `gws` CLI binary for account, config, Gmail, and Calendar commands
- `gws-mcp` binary preserving the existing stdio MCP server
- OAuth2 for personal Gmail and Google Workspace accounts
- Multi-account state via `~/.config/gws/state.json`
- JSON-first output for scripts, plus table/jsonl/tsv formats
- Gmail list/search/read commands
- Calendar list/upcoming commands
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
- Gmail API and Google Calendar API enabled

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

List recent mail:

```bash
gws mail list --query "is:unread" --limit 10
```

Read an email:

```bash
gws mail read MESSAGE_ID
```

Search mail:

```bash
gws mail search "from:client@example.com has:attachment" --limit 20
```

List calendars:

```bash
gws cal calendars
```

List upcoming events:

```bash
gws cal events upcoming --days 7 --limit 10
```

List events in a window:

```bash
gws cal events list --from 2026-05-01T00:00:00-03:00 --to 2026-05-08T00:00:00-03:00
```

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
```

CI runs lint, build, and tests on Node 20 and 22.

## Roadmap

- Refactor service layer so CLI and MCP both wrap pure Google Workspace operations
- Add Drive commands
- Add Sheets commands
- Add Docs commands
- Add People/Contacts commands
- Add incremental OAuth scopes per Workspace surface

## Security

See [SECURITY.md](SECURITY.md). Tokens stay local and are never printed by CLI account commands.
