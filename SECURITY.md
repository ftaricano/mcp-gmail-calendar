# Security

`gws` stores Google OAuth tokens locally. Treat the configured data directory as sensitive.

## Local token storage

- Default CLI config directory: `~/.config/gws`
- Token files are written with mode `0600` where the platform supports POSIX permissions.
- Do not commit files from `~/.config/gws`, `tokens/`, credentials JSON files, or OAuth callback captures.

## Reporting vulnerabilities

Open a private advisory or contact the repository owner directly. Do not publish tokens, client secrets, account emails tied to private tenants, or raw debug logs in public issues.

## CLI error output

The CLI redacts common sensitive keys (`access_token`, `refresh_token`, `client_secret`, `authorization`, etc.) before emitting structured JSON errors, but users should still avoid sharing full terminal logs from authenticated sessions.
