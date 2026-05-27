---
name: alexandria
description: Use when the task requires searching, reading, creating, or updating MSC Alexandria Vault notes, ADRs, runbooks, project memory, or sanitized PI Composer training records.
---

# Alexandria

Alexandria is the MSC Company knowledge vault. Use it before inventing new project context, patterns, decisions, runbooks, skills, or training plans.

## Available tools

Read-only:

- `alexandria_status` — check configured vault path, markdown count, and top folders.
- `alexandria_search` — search markdown notes by text query.
- `alexandria_read_note` — read a markdown note by relative vault path.

Write tools:

- `alexandria_create_note` — create or overwrite a sanitized markdown note with standard frontmatter.
- `alexandria_append_training_record` — append a sanitized PI Composer training record to JSONL.

## Required workflow

1. Search before creating new notes, ADRs, runbooks, skills, or training plans.
2. Read the most relevant notes before proposing a pattern or decision.
3. Prefer relative vault paths from `alexandria_search` results.
4. Never store, repeat, or expose secrets, tokens, credentials, private keys, or raw `.env` values.
5. If a result says content was redacted, do not ask to reveal the redacted value.
6. For PI Composer training examples, use only sanitized context, plan, result, and validation.
7. Use write tools only after reviewing the content for sensitive data.

## Search strategy

Use targeted searches first:

- project name, for example `pi-composer`, `atlas`, `msc-academy`, `portal-detran`
- artifact type, for example `ADR`, `runbook`, `dataset`, `benchmark`, `arquitetura`
- tool or integration name, for example `BAML`, `OpenClaw`, `MCP`, `HuggingFace`

If no result is found, broaden the query before concluding that no prior knowledge exists.

## Reading notes

After search, read only notes that are likely relevant. Start with the top result, then read linked/related notes when needed.

Good:

```text
alexandria_search({ "query": "pi-composer arquitetura" })
alexandria_read_note({ "path": "agentes/pi-composer/arquitetura-pi-composer-api.md" })
```

Bad:

```text
alexandria_read_note({ "path": "C:/Users/.../Alexandria/..." })
```

Use relative paths only.

## Creating notes

Before `alexandria_create_note`:

1. Run `alexandria_search` for the topic.
2. Read any matching note that may already cover the content.
3. Create or overwrite only when the new note is necessary.

Required note fields:

- `path`: relative path ending in `.md`
- `title`: human-readable title
- `tipo`: one of `moc`, `daily`, `infra`, `projeto`, `sei`, `meta`, `adr`, `template`, `dataset`, `runbook`
- `tags`: strings without `#`
- `body`: markdown body without frontmatter

## Training records

Use `alexandria_append_training_record` only for sanitized and useful PI Composer examples.

A good record has:

- `task`: clear instruction or problem
- `context`: sanitized background, optional
- `plan`: transferable plan/decision
- `result`: expected result or summarized patch
- `validation`: command/review/verification performed, if available
- optional `project` and `category` metadata

Do not append raw chat logs, personal data, secrets, private URLs with credentials, or unreviewed `.env` content.
