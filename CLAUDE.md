# CLAUDE.md -- mcp-gmail-calendar

CLI-first Google Workspace tool (`gws`) com servidor MCP de compatibilidade (`gws-mcp`) para Gmail, Calendar, Drive, Docs, Sheets, Tasks e Contacts. Usado por Ferd e pelos agentes do hub como surface primaria de acesso ao Google Workspace.

## O que e

`gws` expoe operacoes completas de Gmail, Calendar, Drive, Docs, Sheets, Tasks e Contacts via CLI e via MCP (protocolo Model Context Protocol). O CLI e o produto principal; o servidor MCP e um adapter de compatibilidade para clientes de IA (Claude, etc.). Publicado como `@mcp/gmail-calendar` v1.1.0, binarios `gws` e `gws-mcp`. Multi-conta via `~/.config/gws/state.json`.

## Stack & estrutura

Node.js 20+ + TypeScript 5.7 strict + Commander (CLI) + googleapis + @modelcontextprotocol/sdk + zod + winston + handlebars; build: `tsc`; testes: `tsx --test` (Node test runner nativo).

```
mcp-gmail-calendar/
  bin/
    gws.js          # entrypoint CLI
    gws-mcp.js      # entrypoint MCP server
  src/
    index.ts        # MCP server (gws-mcp)
    auth/           # OAuth2 flow e multi-account manager
    cli/            # comandos CLI (Commander)
    services/       # Gmail, Calendar, Drive, Docs, Sheets, Tasks, People
    tools/          # MCP tool definitions
    utils/          # formatters, parsers, cache, logger
  tests/            # ~30 arquivos .test.ts (Node test runner)
  templates/        # templates Handlebars para email
  docs/             # documentacao adicional
  .env.example      # variaveis de ambiente necessarias
  tokens/           # tokens OAuth (gitignored)
```

## Como rodar / validar

```bash
# Setup inicial (uma vez)
cp .env.example .env
# Editar .env: GOOGLE_CREDENTIALS_PATH obrigatorio

# Build
npm run build

# Dev CLI sem build
npm run cli -- --help
npm run cli -- mail list --query "is:unread" --limit 5

# Rodar MCP server (stdio)
gws-mcp
# ou: node dist/index.js

# Testes (nao requerem credenciais reais -- usam fakes injetados)
npm test

# Lint
npm run lint
```

## Invariantes / regras criticas

- **Credenciais nunca no repo.** `credentials.json` e tokens OAuth ficam em `~/.config/gws/` ou paths configurados em `.env`; nunca commitados. O `.gitignore` ja exclui `tokens/` e `.env`.
- **Testes usam fakes -- nao chamam Google.** Os ~30 testes injetam servicos falsos; nenhum teste deve depender de credencial real ou rede. Quebrar esse isolamento invalida o CI.
- **CLI e primario; MCP e adapter.** Novas operacoes do Google Workspace entram primeiro no CLI (`src/cli/`) e nos services (`src/services/`). O MCP tool correspondente (`src/tools/`) e adicionado em seguida para parity.
- **`--dry-run` obrigatorio em operacoes mutantes.** Todos os comandos que escrevem, deletam ou modificam dados suportam `--dry-run` e retornam `{ "dryRun": true, "would": ... }`. Nao remover esse comportamento.
- **Resolucao de conta em ordem fixa.** `--account` > `GWS_ACCOUNT` env > `state.json` current > primeiro autenticado > erro. Nao alterar a ordem sem atualizar README.
- **Re-consent ao adicionar novo OAuth scope.** Qualquer novo scope exige que contas ja autenticadas rodem `gws auth login` novamente. Documentar o aviso no README (ver padrao de Tasks e Contacts).
- **Output JSON-first para scripts.** `--format json` e o default; nao alterar o formato padrao sem deprecacao explicita.

## Gotchas

- `npm test` usa `tsx --test $(find tests -name '*.test.ts')` -- a glob e expandida pelo shell; em sistemas sem expansao automatica pode ser necessario listar arquivos explicitamente.
- Scopes OAuth sao cumulativos: adicionar um scope novo nao remove os antigos, mas o usuario precisa re-consentir. `gws auth login` detecta scopes faltantes e reabre o browser automaticamente.
- `drive trash` e `drive batch-delete` movem para a lixeira (recuperavel), nao deletam permanentemente -- comportamento intencional de seguranca.
- Tokens armazenados em `tokens/` (path legado MCP) e em `~/.config/gws/tokens/` (CLI); ambos gitignored mas em paths distintos.
- `DEFAULT_CALENDAR_TIMEZONE=America/Sao_Paulo` esta no `.env.example` -- relevante para operacoes com datas sem timezone explicito.

## Documentacao canonica

- Skill: `gws` (se existir) | Tracking: time JAR
