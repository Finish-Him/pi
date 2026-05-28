import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = join(process.cwd(), "project-management");
const TASKS_DIR = join(ROOT, "tasks");
const OUTPUT_PATH = join(ROOT, "views", "kanban.html");

const COLUMNS = [
	{ key: "todo", label: "To Do" },
	{ key: "in_progress", label: "In Progress" },
	{ key: "blocked", label: "Blocked" },
	{ key: "done", label: "Done" },
];

function escapeHtml(input) {
	return String(input)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function normalizeStatus(rawStatus) {
	if (rawStatus === "todo" || rawStatus === "in_progress" || rawStatus === "blocked" || rawStatus === "done") {
		return rawStatus;
	}
	return "todo";
}

function parseFrontmatter(content) {
	if (!content.startsWith("---\n")) {
		return { meta: {}, body: content };
	}

	const frontmatterEnd = content.indexOf("\n---\n", 4);
	if (frontmatterEnd === -1) {
		return { meta: {}, body: content };
	}

	const rawMeta = content.slice(4, frontmatterEnd).trim();
	const body = content.slice(frontmatterEnd + 5);
	const meta = {};

	for (const line of rawMeta.split("\n")) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		let value = line.slice(separatorIndex + 1).trim();
		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		}
		meta[key] = value;
	}

	return { meta, body };
}

function extractChecklistProgress(body) {
	const lines = body.split("\n");
	const checked = lines.filter((line) => line.trim().startsWith("- [x] ")).length;
	const unchecked = lines.filter((line) => line.trim().startsWith("- [ ] ")).length;
	const total = checked + unchecked;
	return { checked, total };
}

function loadTasks() {
	const taskFiles = readdirSync(TASKS_DIR)
		.filter((name) => name.endsWith(".md"))
		.sort();

	return taskFiles.map((fileName) => {
		const filePath = join(TASKS_DIR, fileName);
		const content = readFileSync(filePath, "utf-8");
		const { meta, body } = parseFrontmatter(content);
		const progress = extractChecklistProgress(body);

		return {
			title: meta.title || basename(fileName, ".md"),
			status: normalizeStatus(meta.status),
			project: meta.project || "-",
			owner: meta.owner || "-",
			priority: meta.priority || "P3",
			updated: meta.updated || "-",
			fileName,
			progress,
		};
	});
}

function renderCard(task) {
	const checklistText = task.progress.total > 0 ? `${task.progress.checked}/${task.progress.total}` : "-";

	return `
		<article class="card">
			<h3>${escapeHtml(task.title)}</h3>
			<ul>
				<li><strong>Projeto:</strong> ${escapeHtml(task.project)}</li>
				<li><strong>Owner:</strong> ${escapeHtml(task.owner)}</li>
				<li><strong>Prioridade:</strong> ${escapeHtml(task.priority)}</li>
				<li><strong>Checklist:</strong> ${escapeHtml(checklistText)}</li>
				<li><strong>Atualizado:</strong> ${escapeHtml(task.updated)}</li>
				<li><strong>Arquivo:</strong> ${escapeHtml(task.fileName)}</li>
			</ul>
		</article>
	`;
}

function renderHtml(tasks) {
	const generatedAt = new Date().toISOString();
	const columnsHtml = COLUMNS.map((column) => {
		const columnTasks = tasks.filter((task) => task.status === column.key);
		const cardsHtml = columnTasks.map(renderCard).join("\n");

		return `
			<section class="column">
				<header>${column.label} <span>${columnTasks.length}</span></header>
				<div class="cards">${cardsHtml || "<p class=\"empty\">Sem tarefas</p>"}</div>
			</section>
		`;
	}).join("\n");

	return `<!doctype html>
<html lang="pt-BR">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Kanban de Tarefas</title>
	<style>
		:root { color-scheme: light dark; }
		body { font-family: Inter, Segoe UI, Arial, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
		h1 { margin: 0 0 8px; }
		.meta { opacity: 0.85; margin-bottom: 18px; font-size: 14px; }
		.board { display: grid; grid-template-columns: repeat(4, minmax(240px, 1fr)); gap: 12px; }
		.column { background: #111827; border: 1px solid #334155; border-radius: 10px; min-height: 220px; }
		.column > header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; font-weight: 700; border-bottom: 1px solid #334155; }
		.column > header span { background: #1f2937; border: 1px solid #334155; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
		.cards { padding: 10px; display: grid; gap: 8px; }
		.card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px; }
		.card h3 { margin: 0 0 6px; font-size: 15px; }
		.card ul { margin: 0; padding-left: 16px; font-size: 13px; line-height: 1.45; }
		.empty { opacity: 0.7; margin: 4px 2px; }
		@media (max-width: 1200px) { .board { grid-template-columns: repeat(2, minmax(240px, 1fr)); } }
		@media (max-width: 700px) { .board { grid-template-columns: 1fr; } }
	</style>
</head>
<body>
	<h1>Kanban de Tarefas (MD → HTML)</h1>
	<div class="meta">Gerado em: ${escapeHtml(generatedAt)} | Fonte: <code>project-management/tasks/*.md</code></div>
	<div class="board">${columnsHtml}</div>
</body>
</html>`;
}

const tasks = loadTasks();
const html = renderHtml(tasks);
writeFileSync(OUTPUT_PATH, html, "utf-8");

console.log(`Kanban gerado em ${OUTPUT_PATH} com ${tasks.length} tarefa(s).`);
