import { appendFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertNoSecrets, redactSecrets, type SecretCategory } from "./security.ts";

const DEFAULT_MAX_NOTE_CHARS = 12_000;
const MAX_NOTE_CHARS = 100_000;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024;
const SNIPPET_RADIUS = 180;
const MAX_NOTE_BODY_CHARS = 80_000;
const MAX_NOTE_TITLE_CHARS = 180;
const MAX_NOTE_TAGS = 24;
const MAX_TAG_CHARS = 40;
const MAX_TRAINING_FIELD_CHARS = 12_000;
const BLOCKED_PATH_PREFIXES = ["arquivo/"];

const ALLOWED_NOTE_TYPES = new Set(["moc", "daily", "infra", "projeto", "sei", "meta", "adr", "template", "dataset", "runbook"]);

const IGNORED_DIRECTORIES = new Set([
	".git",
	".obsidian",
	".trash",
	"node_modules",
	"dist",
	"build",
	"coverage",
	"__pycache__",
	"arquivo",
]);

export type VaultStatus = {
	ok: boolean;
	path: string;
	markdownCount: number;
	topFolders: string[];
	error?: string;
};

export type SearchResult = {
	path: string;
	title: string;
	snippet: string;
	redactedCategories: SecretCategory[];
};

export type ReadNoteResult = {
	path: string;
	content: string;
	truncated: boolean;
	charsRead: number;
	totalChars: number;
	redactedCategories: SecretCategory[];
};

export type CreateNoteInput = {
	path: string;
	title: string;
	tipo: string;
	tags: string[];
	body: string;
	overwrite?: boolean;
};

export type CreateNoteResult = {
	path: string;
	created: boolean;
	overwritten: boolean;
	bytes: number;
};

export type AppendTrainingRecordInput = {
	task: string;
	context?: string;
	plan: string;
	result: string;
	validation?: string;
	project?: string;
	category?: string;
};

export type AppendTrainingRecordResult = {
	path: string;
	bytesAppended: number;
	record: unknown;
};

function configuredVaultPath(): string {
	const configured = process.env.ALEXANDRIA_VAULT_DIR?.trim();
	if (configured) return configured;
	return join(homedir(), "Documents", "Obsidian Vault", "Alexandria");
}

export function getVaultRoot(): string {
	return resolve(configuredVaultPath());
}

function normalizeForCompare(path: string): string {
	return process.platform === "win32" ? path.toLowerCase() : path;
}

function ensureInsideVault(vaultRoot: string, candidatePath: string): string {
	const resolvedRoot = resolve(vaultRoot);
	const resolvedCandidate = resolve(candidatePath);
	const root = normalizeForCompare(resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`);
	const candidate = normalizeForCompare(resolvedCandidate);

	if (candidate !== normalizeForCompare(resolvedRoot) && !candidate.startsWith(root)) {
		throw new Error("Path escapes Alexandria vault root");
	}

	return resolvedCandidate;
}

function normalizeRelativePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "").trim();
}

function assertPathPolicy(relativePath: string): void {
	const normalized = normalizeRelativePath(relativePath).toLowerCase();
	for (const prefix of BLOCKED_PATH_PREFIXES) {
		if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) {
			throw new Error(`Path is blocked by policy: ${prefix}`);
		}
	}
}

export function resolveVaultRelativePath(relativePath: string): string {
	const cleaned = relativePath.trim().replace(/^@+/, "");
	if (!cleaned) throw new Error("Note path is required");
	if (isAbsolute(cleaned)) throw new Error("Use a relative Alexandria note path");
	assertPathPolicy(cleaned);

	const vaultRoot = getVaultRoot();
	return ensureInsideVault(vaultRoot, resolve(vaultRoot, cleaned));
}

function toVaultRelativePath(absolutePath: string): string {
	return relative(getVaultRoot(), absolutePath).replaceAll("\\", "/");
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function collectMarkdownFiles(dir: string, files: string[]): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(entry.name)) continue;
			await collectMarkdownFiles(join(dir, entry.name), files);
			continue;
		}

		if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
			files.push(join(dir, entry.name));
		}
	}
}

export async function listMarkdownFiles(): Promise<string[]> {
	const vaultRoot = getVaultRoot();
	if (!(await pathExists(vaultRoot))) {
		throw new Error(`Alexandria vault not found: ${vaultRoot}`);
	}

	const files: string[] = [];
	await collectMarkdownFiles(vaultRoot, files);
	return files.sort((a, b) => toVaultRelativePath(a).localeCompare(toVaultRelativePath(b)));
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value ?? fallback)));
}

function titleFromContent(content: string, fallbackPath: string): string {
	const frontmatterTitle = content.match(/^---\s*[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
	if (frontmatterTitle) return frontmatterTitle;

	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	if (heading) return heading;

	return basename(fallbackPath, extname(fallbackPath));
}

function compactWhitespace(input: string): string {
	return input.replace(/\s+/g, " ").trim();
}

function makeSnippet(content: string, query: string): string | undefined {
	const lowerContent = content.toLowerCase();
	const lowerQuery = query.toLowerCase();
	const index = lowerContent.indexOf(lowerQuery);
	if (index < 0) return undefined;

	const start = Math.max(0, index - SNIPPET_RADIUS);
	const end = Math.min(content.length, index + query.length + SNIPPET_RADIUS);
	const prefix = start > 0 ? "..." : "";
	const suffix = end < content.length ? "..." : "";
	return compactWhitespace(`${prefix}${content.slice(start, end)}${suffix}`);
}

function escapeYamlString(input: string): string {
	return JSON.stringify(input);
}

function normalizeTags(tags: string[]): string[] {
	return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort();
}

function validateNoteInput(input: CreateNoteInput): void {
	const title = input.title.trim();
	const body = input.body.trim();
	if (!title) throw new Error("Note title is required");
	if (!body) throw new Error("Note body is required");
	if (title.length > MAX_NOTE_TITLE_CHARS) {
		throw new Error(`Note title too long. Max ${MAX_NOTE_TITLE_CHARS} characters`);
	}
	if (body.length > MAX_NOTE_BODY_CHARS) {
		throw new Error(`Note body too long. Max ${MAX_NOTE_BODY_CHARS} characters`);
	}
	if (!ALLOWED_NOTE_TYPES.has(input.tipo)) {
		throw new Error(`Invalid note tipo: ${input.tipo}`);
	}
	if (extname(input.path).toLowerCase() !== ".md") {
		throw new Error("Note path must end with .md");
	}
	if (input.tags.length > MAX_NOTE_TAGS) {
		throw new Error(`Too many tags. Max ${MAX_NOTE_TAGS}`);
	}
	for (const tag of input.tags) {
		if (tag.trim().length > MAX_TAG_CHARS) {
			throw new Error(`Tag too long. Max ${MAX_TAG_CHARS} characters`);
		}
	}
	assertNoSecrets(JSON.stringify(input), "Alexandria note input");
}

function buildFrontmatter(input: CreateNoteInput, now: string): string {
	const date = now.slice(0, 10);
	const tags = normalizeTags(input.tags);
	const tagLines = tags.length > 0 ? tags.map((tag) => `- ${escapeYamlString(tag)}`).join("\n") : "[]";
	const tagsBlock = tags.length > 0 ? `tags:\n${tagLines}` : "tags: []";

	return [
		"---",
		`title: ${escapeYamlString(input.title.trim())}`,
		`tipo: ${input.tipo}`,
		`created: ${date}`,
		`atualizado: ${date}`,
		tagsBlock,
		"---",
		"",
	].join("\n");
}

function buildTrainingRecord(input: AppendTrainingRecordInput): unknown {
	const now = new Date().toISOString();
	const userContent = input.context?.trim() ? `${input.task.trim()}\n\nContexto sanitizado:\n${input.context.trim()}` : input.task.trim();
	const validation = input.validation?.trim() || "Validação não executada; registro criado para planejamento e deve ser revisado antes de treino.";
	const assistantContent = [
		"## Plano",
		"",
		input.plan.trim(),
		"",
		"## Execução",
		"",
		input.result.trim(),
		"",
		"## Validação",
		"",
		validation,
		"",
		"Status: registro sanitizado para dataset PI Composer.",
	].join("\n");

	return {
		messages: [
			{
				role: "system",
				content:
					"Voce e o PI Composer — orquestrador pessoal de tarefas de software. Use planos verificaveis, contexto sanitizado e nunca exponha segredos.",
			},
			{ role: "user", content: userContent },
			{ role: "assistant", content: assistantContent },
		],
		metadata: {
			source: "pi_session",
			category: input.category?.trim() || "documentation",
			project: input.project?.trim() || "pi-composer",
			date: now.slice(0, 10),
			created_at: now,
			created_by: "pi-alexandria-extension",
			quality_score: null,
		},
	};
}

function assertMaxFieldLength(label: string, value: string | undefined): void {
	if (!value) return;
	if (value.length > MAX_TRAINING_FIELD_CHARS) {
		throw new Error(`${label} too long. Max ${MAX_TRAINING_FIELD_CHARS} characters`);
	}
}

function validateTrainingInput(input: AppendTrainingRecordInput): void {
	if (input.task.trim().length < 20) throw new Error("Training task must have at least 20 characters");
	if (input.plan.trim().length < 40) throw new Error("Training plan must have at least 40 characters");
	if (input.result.trim().length < 20) throw new Error("Training result must have at least 20 characters");
	assertMaxFieldLength("task", input.task.trim());
	assertMaxFieldLength("context", input.context?.trim());
	assertMaxFieldLength("plan", input.plan.trim());
	assertMaxFieldLength("result", input.result.trim());
	assertMaxFieldLength("validation", input.validation?.trim());
	assertNoSecrets(JSON.stringify(input), "Training record input");
}

export async function getVaultStatus(): Promise<VaultStatus> {
	const vaultRoot = getVaultRoot();
	try {
		if (!(await pathExists(vaultRoot))) {
			return { ok: false, path: vaultRoot, markdownCount: 0, topFolders: [], error: "Vault path does not exist" };
		}

		const [files, entries] = await Promise.all([listMarkdownFiles(), readdir(vaultRoot, { withFileTypes: true })]);
		const topFolders = entries
			.filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
			.map((entry) => entry.name)
			.sort();

		return { ok: true, path: vaultRoot, markdownCount: files.length, topFolders };
	} catch (error) {
		return {
			ok: false,
			path: vaultRoot,
			markdownCount: 0,
			topFolders: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function searchVault(query: string, limit?: number): Promise<SearchResult[]> {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) throw new Error("Search query is required");

	const effectiveLimit = clampInteger(limit, DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);
	const files = await listMarkdownFiles();
	const results: SearchResult[] = [];

	for (const file of files) {
		if (results.length >= effectiveLimit) break;

		const metadata = await stat(file);
		if (metadata.size > MAX_SEARCH_FILE_BYTES) continue;

		const relativePath = toVaultRelativePath(file);
		const pathMatches = relativePath.toLowerCase().includes(trimmedQuery.toLowerCase());
		const content = await readFile(file, "utf8");
		const snippet = makeSnippet(content, trimmedQuery);
		if (!pathMatches && !snippet) continue;

		const rawSnippet = snippet ?? compactWhitespace(content.slice(0, SNIPPET_RADIUS * 2));
		const redacted = redactSecrets(rawSnippet);
		results.push({
			path: relativePath,
			title: titleFromContent(content, relativePath),
			snippet: redacted.text,
			redactedCategories: redacted.categories,
		});
	}

	return results;
}

export async function readNote(relativePath: string, maxChars?: number): Promise<ReadNoteResult> {
	const absolutePath = resolveVaultRelativePath(relativePath);
	if (extname(absolutePath).toLowerCase() !== ".md") {
		throw new Error("Only markdown notes (.md) can be read from Alexandria");
	}

	const vaultRoot = getVaultRoot();
	const resolvedParent = ensureInsideVault(vaultRoot, dirname(absolutePath));
	const resolvedPath = ensureInsideVault(vaultRoot, join(resolvedParent, basename(absolutePath)));
	const content = await readFile(resolvedPath, "utf8");
	const effectiveMaxChars = clampInteger(maxChars, DEFAULT_MAX_NOTE_CHARS, 1, MAX_NOTE_CHARS);
	const truncated = content.length > effectiveMaxChars;
	const sliced = truncated ? content.slice(0, effectiveMaxChars) : content;
	const redacted = redactSecrets(sliced);

	return {
		path: toVaultRelativePath(resolvedPath),
		content: redacted.text,
		truncated,
		charsRead: sliced.length,
		totalChars: content.length,
		redactedCategories: redacted.categories,
	};
}

export async function createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
	validateNoteInput(input);
	const absolutePath = resolveVaultRelativePath(input.path);
	const existed = await pathExists(absolutePath);
	const overwrite = input.overwrite ?? true;
	if (existed && !overwrite) {
		throw new Error(`Alexandria note already exists: ${input.path}`);
	}

	const now = new Date().toISOString();
	const content = `${buildFrontmatter(input, now)}# ${input.title.trim()}\n\n${input.body.trim()}\n`;
	assertNoSecrets(content, "Alexandria note content");
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, content, "utf8");

	return {
		path: toVaultRelativePath(absolutePath),
		created: !existed,
		overwritten: existed,
		bytes: Buffer.byteLength(content, "utf8"),
	};
}

export async function appendTrainingRecord(input: AppendTrainingRecordInput): Promise<AppendTrainingRecordResult> {
	validateTrainingInput(input);
	const record = buildTrainingRecord(input);
	const line = `${JSON.stringify(record)}\n`;
	assertNoSecrets(line, "Training record");

	const date = new Date().toISOString().slice(0, 10);
	const absolutePath = resolveVaultRelativePath(`agentes/pi-composer/records/${date}.jsonl`);
	await mkdir(dirname(absolutePath), { recursive: true });
	await appendFile(absolutePath, line, "utf8");

	return {
		path: toVaultRelativePath(absolutePath),
		bytesAppended: Buffer.byteLength(line, "utf8"),
		record,
	};
}
