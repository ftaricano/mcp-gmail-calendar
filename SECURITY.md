# Security

`gws` stores Google OAuth tokens locally. Treat the configured data directory as sensitive.

## Local token storage

- Default CLI config directory: `~/.config/gws`
- Token files are written with mode `0600` where the platform supports POSIX permissions.
- Do not commit files from `~/.config/gws`, `tokens/`, credentials JSON files, or OAuth callback captures.

## HTML sanitization (secure by default)

Email HTML bodies are sanitized before being returned to CLI/MCP consumers, mitigating stored XSS and HTML-injection from untrusted message content.

- Sanitization is **on by default**. It stays enabled when `ENABLE_HTML_SANITIZATION` is unset or set to anything other than the literal string `false`.
- To disable it you must explicitly set `ENABLE_HTML_SANITIZATION=false`. This is an opt-out that exposes raw HTML to consumers; do not use it with untrusted mailboxes.
- The same secure-by-default rule governs `validateHtmlContent`, which screens outbound HTML for dangerous patterns (`<script>`, `<iframe>`, `javascript:`, inline event handlers).

## Reporting vulnerabilities

Open a private advisory or contact the repository owner directly. Do not publish tokens, client secrets, account emails tied to private tenants, or raw debug logs in public issues.

## CLI error output

The CLI redacts common sensitive keys (`access_token`, `refresh_token`, `client_secret`, `authorization`, etc.) before emitting structured JSON errors, but users should still avoid sharing full terminal logs from authenticated sessions.
