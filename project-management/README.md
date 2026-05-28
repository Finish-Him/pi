# Project Management (MD + HTML)

## Objetivo
Usar Markdown como fonte de verdade para projetos/tarefas e gerar visualização auxiliar em HTML (Kanban).

## Estrutura
- `project-management/tasks/`: tarefas em `.md` com frontmatter
- `project-management/scripts/generate-kanban.mjs`: gera board HTML
- `project-management/views/kanban.html`: board gerado

## Frontmatter obrigatório por tarefa
```yaml
---
title: "Título da tarefa"
status: "todo" # todo | in_progress | blocked | done
project: "nome-do-projeto"
owner: "responsavel"
priority: "P1" # P1 | P2 | P3
updated: "2026-05-27"
---
```

## Comando de geração
```bash
npm run kanban:generate
# ou
node project-management/scripts/generate-kanban.mjs
```

## Fluxo recomendado
1. Criar/atualizar tarefas em `tasks/*.md`
2. Regenerar board HTML
3. Abrir `project-management/views/kanban.html` no navegador
