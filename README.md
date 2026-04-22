# Gmail & Google Calendar MCP Server

Status: beta

MCP server for Gmail and Google Calendar workflows. It combines email operations, calendar management, multi-account OAuth, attachments, and reusable email templates in a single local server.

## Why this exists

Most MCP setups treat inbox and calendar work as separate integrations. This project keeps those workflows together so an assistant can:
- authenticate one or more Google accounts,
- read and send email,
- manage labels and attachments,
- create and update calendar events,
- switch accounts when personal and workspace contexts differ.

## What it includes

- 35 MCP tools across account, Gmail, Calendar, attachment, and template workflows
- OAuth2 authentication for personal Gmail and Google Workspace accounts
- Multi-account switching
- Gmail search, send, reply, forward, label, and batch operations
- Calendar listing, event CRUD, availability checks, invitation responses, and quick add
- HTML email template rendering and custom templates
- MCP resources for account-level Gmail and Calendar snapshots

## Quickstart

Prerequisites:
- Node.js 18+
- A Google Cloud project with Gmail API and Google Calendar API enabled
- OAuth client credentials created as a Desktop application

1. Install dependencies

```bash
git clone https://github.com/ftaricano/mcp-gmail-calendar.git
cd mcp-gmail-calendar
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

Set at least these values in `.env`:

```env
GOOGLE_CREDENTIALS_PATH=/absolute/path/to/credentials.json
OAUTH_CALLBACK_PORT=3000
TOKENS_PATH=./tokens
LOG_LEVEL=info
```

3. Build the server

```bash
npm run build
```

4. Add it to your MCP client

```json
{
  "mcpServers": {
    "gmail-calendar": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-gmail-calendar/dist/index.js"],
      "env": {
        "GOOGLE_CREDENTIALS_PATH": "/absolute/path/to/credentials.json",
        "OAUTH_CALLBACK_PORT": "3000",
        "TOKENS_PATH": "/absolute/path/to/mcp-gmail-calendar/tokens"
      }
    }
  }
}
```

5. Authenticate the first account

Use the `authenticate` tool from your MCP client:

```json
{
  "name": "authenticate",
  "arguments": {
    "email": "you@example.com",
    "accountType": "personal"
  }
}
```

After authentication, use `list_accounts` or `switch_account` before Gmail or Calendar actions when needed.

## Typical use cases

- triage and reply to inbox messages without leaving the MCP client,
- create calendar events from email context,
- manage separate personal and work Google accounts,
- generate templated outbound email with attachments,
- inspect upcoming events or free/busy windows before scheduling.

## Tool groups

### Account management
- `authenticate`
- `list_accounts`
- `switch_account`
- `remove_account`
- `get_current_account`

### Gmail
- `email_list`, `email_read`, `email_send`, `email_reply`, `email_forward`
- `email_delete`, `email_mark_read`, `email_mark_unread`, `email_search`
- `email_move`, `email_label`, `email_create_label`, `email_list_labels`, `email_batch_operations`

### Attachments
- `email_list_attachments`
- `email_download_attachment`

Note: `email_download_attachment.savePath` is treated as a filename hint only. Attachments are written into the local sandbox under `ATTACHMENT_DOWNLOAD_DIR/<account>/` to avoid arbitrary filesystem writes.

### Calendar
- `calendar_list`
- `event_list`, `event_get`, `event_create`, `event_update`, `event_delete`
- `calendar_get_availability`, `event_respond`, `event_search`, `event_quick_add`, `event_upcoming`

### Templates
- `template_list`
- `template_render`
- `template_create`

## Notes on setup

- The server expects Google OAuth desktop credentials, not a service account.
- Tokens are stored locally using the configured `TOKENS_PATH`.
- Downloaded attachments are sandboxed under `ATTACHMENT_DOWNLOAD_DIR` (default: `./attachments/downloads`).
- Some operations require selecting an authenticated account first.
- The server also exposes `gmail://account/{email}` and `calendar://account/{email}` resources.

## Development

```bash
npm run build
npm run lint
npm test
```

## License

MIT
