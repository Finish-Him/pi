# Alexandria Extension (project-local)

This extension is loaded from `.pi/extensions/alexandria/index.ts` and provides Alexandria Vault tools for Pi.

## Tools

- `alexandria_status`
- `alexandria_search`
- `alexandria_read_note`
- `alexandria_create_note`
- `alexandria_append_training_record`

## Vault path

Resolution order:

1. `ALEXANDRIA_VAULT_DIR`
2. `~/Documents/Obsidian Vault/Alexandria` (Windows-compatible default)

Recommended team standard (PowerShell profile):

```powershell
$env:ALEXANDRIA_VAULT_DIR = "C:\Users\Moises e  Naiara\Documents\Obsidian Vault\Alexandria"
```

## Guardrails

- Rejects absolute paths and traversal outside vault root.
- Blocks `arquivo/` paths by policy.
- Redacts secret-like content in read/search output.
- Write tools reject secret-like content.
- Extension writes per-tool audit entries into session history via `pi.appendEntry("alexandria_audit", ...)` without storing note bodies or secret values.

## Local tests

Run extension-level tests:

```bash
node --import tsx --test .pi/extensions/alexandria/test/alexandria.test.ts
```
