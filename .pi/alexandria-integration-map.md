# MSC Alexandria Integration Map

Status: implemented as project-local Pi extension and skill. Read-only tools plus guarded write tools are available.

## Goal

Add Alexandria Vault support to this Pi fork using Pi-native project resources:

- `.pi/extensions/alexandria/` for LLM-callable tools and commands.
- `.pi/skills/alexandria/SKILL.md` for on-demand workflow instructions.
- No core Pi changes for the first iteration.

## References checked

- `packages/coding-agent/docs/skills.md`
- `packages/coding-agent/docs/extensions.md`
- `packages/coding-agent/docs/settings.md`
- Existing project resources under `.pi/extensions/`, `.pi/prompts/`, `.pi/skills/`
- Alexandria notes: `agentes/pi-composer/arquitetura-pi-composer-api.md`, `agentes/pi-composer/analise-openclaw.md`

## Proposed architecture

```text
.pi/
  extensions/
    alexandria/
      index.ts              # registers tools and commands
      vault.ts              # filesystem access, search, safe path handling
      security.ts           # secret-pattern guard for write operations
  skills/
    alexandria/
      SKILL.md              # when/how to use Alexandria
```

Pi already auto-discovers `.pi/extensions/*/index.ts` and `.pi/skills/*/SKILL.md`, so no `.pi/settings.json` is required for project-local use.

## Phase 1 tools: read-only

Implement first:

| Tool | Purpose | Mutates vault? |
|---|---|---|
| `alexandria_status` | Show vault path, markdown count, top folders | no |
| `alexandria_search` | Search markdown notes by text query | no |
| `alexandria_read_note` | Read a note by relative path with max-char limit | no |

Default vault resolution:

1. `ALEXANDRIA_VAULT_DIR` env var, if set.
2. Windows default: `C:\Users\Moises e  Naiara\Documents\Obsidian Vault\Alexandria`.
3. Fail closed with a clear error if missing.

Search behavior:

- Markdown-only.
- Recursive.
- Ignore `.git`, `node_modules`, `.obsidian`, large/generated folders if present.
- Return relative path, title-ish label, and matching snippet.
- Truncate output using Pi truncation utilities or conservative local limits.

Read behavior:

- Accept relative vault paths only.
- Reject absolute paths, `..`, and paths escaping vault root.
- Block `arquivo/` by policy.
- Default max chars: 12,000.

## Phase 2 tools: safe writes

Implemented after read-only smoke tests:

| Tool | Purpose | Guardrails |
|---|---|---|
| `alexandria_create_note` | Create/overwrite standardized markdown note | blocks secret-looking content |
| `alexandria_append_training_record` | Append sanitized JSONL record for PI Composer dataset | schema validation + secret guard |

Secret guard blocks at minimum:

- private keys
- GitHub tokens
- OpenAI/OpenRouter/HF-style API keys
- AWS access keys
- database URLs containing credentials
- `.env`-style assignments with high-entropy values

Never print blocked secret values; report only pattern category and field/path.

Additional hardening implemented:

- Max sizes for note title/body/tags.
- Max sizes for training-record fields.
- Per-tool audit trail persisted in Pi session (`customType: alexandria_audit`) without note body content.

## Skill design

Skill name: `alexandria`

Description should be specific enough for progressive loading:

> Use when the task requires searching, reading, creating, or updating MSC Alexandria Vault notes, ADRs, runbooks, project memory, or sanitized PI Composer training records.

Instructions:

1. Search before creating new notes, decisions, runbooks, skills, or training plans.
2. Prefer relative note paths.
3. Never store secrets or raw credentials.
4. For training examples, sanitize context and validation before append.
5. Use write tools only after reviewing content for sensitive data.

## Commands

Optional command for interactive use:

- `/alexandria` — show status and configured vault path.
- `/alexandria-search <query>` — quick UI notification/list is optional; tool is enough for LLM use.

Phase 1 can skip commands except `/alexandria` if keeping scope small.

## Test strategy

Because this is project-local extension code, start with smoke tests instead of full repo checks:

1. TypeScript syntax/type smoke via Pi runtime loading.
2. `pi -e ./.pi/extensions/alexandria/index.ts -p "use alexandria_status"` if model/tool path supports print-mode tool calls.
3. Manual `/reload` in interactive mode.
4. Verify tools do not expose absolute path traversal.
5. Verify read/search truncation.

Before changing core packages or adding repo-wide tests, run `npm run check` per `AGENTS.md`.

## Implementation order

1. Create read-only extension files. Done.
2. Create `alexandria` skill. Done.
3. Run local smoke checks. Done.
4. Add safe write tools. Done.
5. Consider extracting as reusable Pi package after project-local version stabilizes.

## Non-goals for first iteration

- No core Pi changes.
- No network service.
- No MCP dependency.
- No write tools until read-only path is validated.
- No automatic indexing database; filesystem search is sufficient for v0.
