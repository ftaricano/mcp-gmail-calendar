# SDD — `gws` Workspace Surface Completeness

- **Data:** 2026-06-14
- **Repo:** `ftaricano/mcp-gmail-calendar` (produto: `gws` CLI + `gws-mcp` MCP server)
- **Base:** `main` (pós-merge `#4` feat CLI-first gws)
- **Tipo:** Spec-Driven Design (SDD). Implementação por TDD, entregue em PRs por surface.
- **Gate de cada PR:** `/code-review high` (built-in) iterando até zero findings acionáveis. PR fica **aberto** (sem merge sem aprovação humana).

## 1. Objetivo

Levar o `gws` de cobertura parcial para **cobertura completa e útil** das APIs Google Workspace,
expondo cada operação tanto na **CLI** quanto no **MCP** (paridade de surface), sem regressões,
com testes para cada caminho novo.

Princípio anti-bloat (YAGNI): cobrir as operações **úteis e comuns** de cada API — não cada campo
exótico. "Útil" = operações que um humano no terminal ou um agente via MCP realmente executa.

## 2. Estado atual (baseline, via inventário 2026-06-14)

| Surface | Cobertura | CLI | MCP |
|---|---|---|---|
| Gmail | ~60% | ✅ | ✅ |
| Calendar | ~75% | ✅ | ✅ |
| Drive | ~50% | ✅ | ❌ CLI-only |
| Docs | ~30% | ✅ | ❌ CLI-only |
| Sheets | ~35% | ✅ | ❌ CLI-only |
| Tasks | 0% | ❌ | ❌ |
| People/Contacts | 0% | ❌ | ❌ |

**Bugs High abertos** (do `AUDIT_REPORT.md`, fora dos PRs de segurança do JAR-322):
- **H2** — `CalendarService.respondToInvitation()` patcheia *todos* os attendees em vez de só o usuário atual.
- **M1** — `GmailService.replyToEmail()` não preserva threading (sem `In-Reply-To`/`References`; `threadId` não vai no send).

## 3. Escopo OAuth

Scopes atuais já cobrem Gmail/Calendar/Drive/Docs/Sheets full R/W — **aprofundar essas 5 APIs não exige re-consent**.

Surfaces novos exigem novos scopes (→ **re-consent de todas as contas**, documentado como passo de migração):
- Tasks: `https://www.googleapis.com/auth/tasks`
- People/Contacts: `https://www.googleapis.com/auth/contacts`

A goal **mantém entrega faseada por PR** (decisão: "Onda 1" = forma de entregar, não teto de escopo);
os novos scopes entram nos PRs 6 e 7.

## 4. Escopo de entrega — 7 PRs

Cada PR: `spec (esta seção) → TDD red-green → /code-review high até APPROVE → PR aberto`.

### PR 1 — Gmail completeness + fix M1 *(scope existente)*
- Drafts: `list / get / create / update / send / delete` (`users.drafts.*`).
- Threads: `list / get / modify (add/remove labels) / trash / delete` (`users.threads.*`).
- Archive (remover label `INBOX`) e permanent-delete (`users.messages.delete` vs trash atual).
- **Fix M1**: estender `SendEmailOptions` + `buildEmailMessage()` com `In-Reply-To`/`References`;
  passar `threadId` no `users.messages.send`. Teste inspeciona headers RFC822 + body da request.
- CLI `gws mail drafts …`, `gws mail threads …`, `gws mail archive`, `gws mail delete --permanent`.
- MCP `email_draft_*`, `email_thread_*`. Zod validation nos handlers mutating tocados (M6).

### PR 2 — Calendar completeness + fix H2 *(scope existente)*
- Recurring instances: `events.instances` (list), update de ocorrência única vs `thisAndFollowing`.
- Calendários secundários: `calendars.insert / delete`, `calendarList` properties básicas.
- **Fix H2**: resolver e-mail do attendee autenticado e patchear **somente** esse attendee.
  Teste com ≥2 attendees provando que só o self muda.
- CLI/MCP correspondentes.

### PR 3 — Drive completeness + MCP parity *(scope existente)*
- `trash/restore`, `copy`, batch-delete, `revisions.list`, shared drives (`drives.list`), shortcuts.
- Expor `drive_*` como tools MCP (hoje CLI-only).

### PR 4 — Docs batchUpdate + MCP parity *(scope existente)*
- `documents.batchUpdate`: insert/replace text, formatação (bold/italic/named styles), tabelas, imagens.
- Expor `docs_*` MCP tools.

### PR 5 — Sheets batchUpdate + MCP parity *(scope existente)*
- `spreadsheets.batchUpdate`: add/delete/rename de abas, formatação, fórmulas (`USER_ENTERED`),
  data validation, clear de ranges.
- Expor `sheets_*` MCP tools.

### PR 6 — Tasks API *(novo scope: tasks)*
- Novo `TasksService` + scope `tasks` no `GoogleAuthManager`.
- `tasklists`: list/get/create/update/delete. `tasks`: list/get/create/update/complete/move/delete.
- CLI `gws tasks …` + MCP `tasks_*`. Doc de re-consent.

### PR 7 — People/Contacts API *(novo scope: contacts)*
- Novo `PeopleService` + scope `contacts`.
- Contacts: list/search/get/create/update/delete; contactGroups list/get.
- CLI `gws contacts …` + MCP `people_*`. Doc de re-consent.

## 5. Transversal (em cada PR, conforme toca)

- **Zod validation** nos handlers MCP mutating (fecha M6 de passagem; não cria PR dedicado).
- Preservar padrão **dry-run** + envelope `{account, dryRun, would}` para toda op mutating.
- `node:test` com service-factory DI (fakes) — sem credenciais Google reais nos testes.
- Atualizar `README.md` (nova surface) + bump `package.json` version + manter `gws --version` sincronizado.
- Output `json|table|jsonl|tsv` respeitado nas novas saídas.

## 6. Coordenação / riscos

- **JAR-322 (project-improver)** já tem PRs de segurança abertos (M2 loopback `#7`, SSRF `#6`, M3 sanitize):
  **não duplicar**. Esta goal é ortogonal (features). Único toque comum: `GoogleAuthManager`
  (PRs 6/7 adicionam scopes; `#7` mexe no `listen`) → resolver por rebase.
- Re-consent (PRs 6/7) é disruptivo para usuários existentes → documentar claramente; sequenciar por último.
- PR grande reprova no review senior → disciplina de 1 surface por PR é inegociável.

## 7. Critério de pronto (por PR)

1. `npm run lint && npm run build && npm test` verdes (incl. novos testes).
2. Paridade CLI↔MCP para as ops novas do surface.
3. `/code-review high` sem findings acionáveis (APPROVE).
4. README/version atualizados. PR aberto com descrição rastreável à issue-goal.

## 8. Critério de pronto (goal)

Os 7 PRs abertos e aprovados no review; cobertura das 7 surfaces ≥ "útil-completa";
sem regressão nos 33 testes baseline; re-consent documentado.
