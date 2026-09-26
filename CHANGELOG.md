# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-09-25

### Changed

- **Breaking:** the repository is now `ftaricano/mcp-google-workspace` (formerly
  `ftaricano/mcp-gmail-calendar`; GitHub redirects the old URL).
- **Breaking:** the CLI binary `gws` is now `gwcli`, to avoid a clash with Google's official
  Workspace CLI, which also installs `gws`.
- **Breaking:** the package is now `@ftaricano/mcp-google-workspace` (was `@mcp/gmail-calendar`,
  never published).
- The MCP server binary is now `mcp-google-workspace`; `gws-mcp` remains as an alias.
- The MCP server reports its name as `mcp-google-workspace`.
- The default log file is `./logs/mcp-google-workspace.log`.

### Unchanged

- The config directory (`~/.config/gws`) and the `GWS_*` environment variables, so existing
  accounts and tokens keep working.
- MCP tool names.

[Unreleased]: https://github.com/ftaricano/mcp-google-workspace/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/ftaricano/mcp-google-workspace/releases/tag/v2.0.0
