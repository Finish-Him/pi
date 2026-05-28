---
title: "Sanitizar settings de retry e thinking level"
status: "done"
project: "pi"
owner: "moises"
priority: "P1"
updated: "2026-05-27"
---

## Contexto
Evitar que valores inválidos em `settings.json` afetem runtime.

## Critério de aceite
- [x] Sanitização de retry aplicada
- [x] Sanitização de thinking level aplicada
- [x] Testes de settings manager passando

## Validação
- [x] `node ../../node_modules/vitest/dist/cli.js --run test/settings-manager.test.ts`
- [x] `npm run check`
