# AGENTS.md -- mcp-gmail-calendar

As regras operacionais deste repo sao canonicas em [CLAUDE.md](CLAUDE.md) (fonte unica para Claude/Codex/Hermes). Leia-o antes de tocar em codigo.

TL;DR das invariantes:
- Credenciais nunca no repo -- `credentials.json` e tokens ficam em `~/.config/gws/` ou paths do `.env`; gitignored.
- Testes usam fakes injetados -- nenhum teste deve chamar o Google real; isolamento e contrato do CI.
- CLI e primario, MCP e adapter -- novas operacoes entram em `src/cli/` + `src/services/` primeiro, depois `src/tools/`.
- `--dry-run` obrigatorio em mutantes -- retorna `{ "dryRun": true, "would": ... }`; nao remover.
- Re-consent ao adicionar scope OAuth -- documentar aviso no README seguindo padrao de Tasks/Contacts.

Validar: `npm test && npm run lint`
