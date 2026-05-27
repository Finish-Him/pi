# Merge Checklist — Alexandria Integration

## PR
- [ ] PR #1 reviewed: https://github.com/Finish-Him/pi/pull/1
- [ ] Scope confirmed: project-local `.pi/` resources only (no `packages/*` core changes)

## Functional
- [ ] `/reload` loads extension and skill
- [ ] `alexandria_status` returns vault path + counts
- [ ] `alexandria_search` returns relevant results with redacted snippets when needed
- [ ] `alexandria_read_note` reads by relative path only
- [ ] `alexandria_create_note` creates note with frontmatter
- [ ] `alexandria_append_training_record` appends valid JSONL

## Security / Guardrails
- [ ] Absolute paths rejected
- [ ] Path traversal (`..`) rejected
- [ ] `arquivo/` policy block confirmed
- [ ] Secret-like content blocked on write tools
- [ ] Secret-like content redacted on read/search outputs
- [ ] Audit entries appended as `alexandria_audit` without sensitive body content

## Tests / Quality
- [ ] `npm run check` passed
- [ ] `node --import tsx --test .pi/extensions/alexandria/test/alexandria.test.ts` passed
- [ ] Local manual smoke run done in interactive Pi

## Rollout
- [ ] Team standard for `ALEXANDRIA_VAULT_DIR` documented
- [ ] README reviewed: `.pi/extensions/alexandria/README.md`
- [ ] Skill reviewed: `.pi/skills/alexandria/SKILL.md`

## Post-merge (optional)
- [ ] Extract extension + skill as reusable package
- [ ] Add CI job specifically for `.pi/extensions/alexandria/test`
