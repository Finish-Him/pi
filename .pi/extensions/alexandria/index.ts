import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import {
	appendTrainingRecord,
	createNote,
	getVaultStatus,
	readNote,
	searchVault,
	type AppendTrainingRecordResult,
	type CreateNoteResult,
	type ReadNoteResult,
	type SearchResult,
	type VaultStatus,
} from "./vault.ts";

const NOTE_TYPES = ["moc", "daily", "infra", "projeto", "sei", "meta", "adr", "template", "dataset", "runbook"] as const;

const EMPTY_PARAMS = Type.Object({});

const SEARCH_PARAMS = Type.Object({
	query: Type.String({ description: "Text to search for in Alexandria markdown notes" }),
	limit: Type.Optional(Type.Number({ description: "Maximum number of results to return, from 1 to 50" })),
});

const READ_NOTE_PARAMS = Type.Object({
	path: Type.String({ description: "Relative markdown note path inside the Alexandria vault" }),
	maxChars: Type.Optional(Type.Number({ description: "Maximum characters to read, default 12000" })),
});

const CREATE_NOTE_PARAMS = Type.Object({
	path: Type.String({ description: "Relative markdown note path inside Alexandria. Must end with .md" }),
	title: Type.String({ description: "Human-readable note title" }),
	tipo: StringEnum(NOTE_TYPES),
	tags: Type.Array(Type.String({ description: "Tag without #" })),
	body: Type.String({ description: "Markdown note body without YAML frontmatter" }),
	overwrite: Type.Optional(Type.Boolean({ description: "Overwrite if note already exists. Defaults to true" })),
});

const APPEND_TRAINING_RECORD_PARAMS = Type.Object({
	task: Type.String({ description: "Instruction or task, sanitized" }),
	context: Type.Optional(Type.String({ description: "Sanitized context. Do not include secrets, personal data, or raw credentials" })),
	plan: Type.String({ description: "Plan or decision" }),
	result: Type.String({ description: "Expected result or summarized patch" }),
	validation: Type.Optional(Type.String({ description: "Validation performed, command summary, or review note" })),
	project: Type.Optional(Type.String({ description: "Project label for metadata" })),
	category: Type.Optional(Type.String({ description: "Dataset category for metadata" })),
});

type SearchParams = Static<typeof SEARCH_PARAMS>;
type ReadNoteParams = Static<typeof READ_NOTE_PARAMS>;
type CreateNoteParams = Static<typeof CREATE_NOTE_PARAMS>;
type AppendTrainingRecordParams = Static<typeof APPEND_TRAINING_RECORD_PARAMS>;

function formatStatus(status: VaultStatus): string {
	const lines = ["# Alexandria Vault", "", `Status: ${status.ok ? "ok" : "error"}`, `Path: ${status.path}`];
	if (status.error) lines.push(`Error: ${status.error}`);
	lines.push(`Markdown notes: ${status.markdownCount}`);
	lines.push(`Top folders: ${status.topFolders.length > 0 ? status.topFolders.join(", ") : "none"}`);
	return lines.join("\n");
}

function formatSearchResults(query: string, results: SearchResult[]): string {
	if (results.length === 0) {
		return `No Alexandria notes found for: ${query}`;
	}

	const lines = [`# Alexandria Search`, "", `Query: ${query}`, `Results: ${results.length}`, ""];
	for (const result of results) {
		lines.push(`- [[${result.path}]] — ${result.title}`);
		lines.push(`  ${result.snippet}`);
		if (result.redactedCategories.length > 0) {
			lines.push(`  Redacted: ${result.redactedCategories.join(", ")}`);
		}
	}
	return lines.join("\n");
}

function formatReadNote(result: ReadNoteResult): string {
	const lines = [`# ${result.path}`, "", result.content];
	if (result.truncated) {
		lines.push("", `[Truncated: showing ${result.charsRead} of ${result.totalChars} characters.]`);
	}
	if (result.redactedCategories.length > 0) {
		lines.push("", `[Redacted secret-like content: ${result.redactedCategories.join(", ")}.]`);
	}
	return lines.join("\n");
}

function formatCreateNote(result: CreateNoteResult): string {
	const action = result.overwritten ? "overwritten" : "created";
	return `Alexandria note ${action}: ${result.path}\nBytes: ${result.bytes}`;
}

function formatTrainingRecord(result: AppendTrainingRecordResult): string {
	return `Training record appended: ${result.path}\nBytes appended: ${result.bytesAppended}`;
}

export default function alexandriaExtension(pi: ExtensionAPI) {
	pi.registerCommand("alexandria", {
		description: "Show Alexandria vault status",
		handler: async (_args, ctx) => {
			const status = await getVaultStatus();
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Alexandria ${status.ok ? "ok" : "error"}: ${status.markdownCount} markdown notes`,
					status.ok ? "info" : "error",
				);
				ctx.ui.setWidget("alexandria-status", [formatStatus(status)], { placement: "belowEditor" });
			}
		},
	});

	pi.registerTool({
		name: "alexandria_status",
		label: "Alexandria Status",
		description: "Show status for the local Alexandria Vault integration.",
		promptSnippet: "Show Alexandria Vault path, markdown note count, and top folders",
		promptGuidelines: [
			"Use alexandria_status when the user asks whether Alexandria is available or where the vault is configured.",
		],
		parameters: EMPTY_PARAMS,
		async execute() {
			const status = await getVaultStatus();
			return {
				content: [{ type: "text", text: formatStatus(status) }],
				details: status,
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("alexandria_status")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as VaultStatus | undefined;
			if (!details) return new Text(theme.fg("dim", "Alexandria status unavailable"), 0, 0);
			const color = details.ok ? "success" : "error";
			return new Text(
				theme.fg(color, `Alexandria ${details.ok ? "ok" : "error"}`) +
					theme.fg("dim", ` — ${details.markdownCount} notes`),
				0,
				0,
			);
		},
	});

	pi.registerTool({
		name: "alexandria_search",
		label: "Alexandria Search",
		description:
			"Search markdown notes in the local Alexandria Vault. Results include relative note path, title, and a redacted snippet.",
		promptSnippet: "Search MSC Alexandria Vault markdown notes by text query",
		promptGuidelines: [
			"Use alexandria_search before creating new notes, ADRs, runbooks, skills, or training plans related to MSC projects.",
			"Use alexandria_search to find existing project memory before making architectural recommendations.",
		],
		parameters: SEARCH_PARAMS,
		async execute(_toolCallId, params: SearchParams) {
			const results = await searchVault(params.query, params.limit);
			return {
				content: [{ type: "text", text: formatSearchResults(params.query, results) }],
				details: { query: params.query, limit: params.limit, results },
			};
		},
		renderCall(args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("alexandria_search ")) + theme.fg("accent", `"${args.query}"`),
				0,
				0,
			);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { results?: SearchResult[] } | undefined;
			const count = details?.results?.length ?? 0;
			return new Text(theme.fg("success", `${count} Alexandria result${count === 1 ? "" : "s"}`), 0, 0);
		},
	});

	pi.registerTool({
		name: "alexandria_read_note",
		label: "Alexandria Read Note",
		description:
			"Read a markdown note from Alexandria by relative vault path. Output is limited and secret-like values are redacted.",
		promptSnippet: "Read an Alexandria Vault markdown note by relative path",
		promptGuidelines: [
			"Use alexandria_read_note after alexandria_search when a found note is relevant to the user's task.",
			"Only pass relative Alexandria note paths to alexandria_read_note; never pass absolute paths.",
		],
		parameters: READ_NOTE_PARAMS,
		async execute(_toolCallId, params: ReadNoteParams) {
			const result = await readNote(params.path, params.maxChars);
			return {
				content: [{ type: "text", text: formatReadNote(result) }],
				details: result,
			};
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("alexandria_read_note ")) + theme.fg("accent", args.path), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as ReadNoteResult | undefined;
			if (!details) return new Text(theme.fg("dim", "Alexandria note read"), 0, 0);
			let text = theme.fg("success", details.path);
			if (details.truncated) text += theme.fg("warning", " (truncated)");
			if (details.redactedCategories.length > 0) text += theme.fg("warning", " (redacted)");
			return new Text(text, 0, 0);
		},
	});

	pi.registerTool({
		name: "alexandria_create_note",
		label: "Alexandria Create Note",
		description:
			"Create or overwrite a sanitized markdown note in Alexandria with standard YAML frontmatter. Blocks secret-like content.",
		promptSnippet: "Create or overwrite a sanitized Alexandria markdown note with standard frontmatter",
		promptGuidelines: [
			"Use alexandria_search before alexandria_create_note to avoid duplicating existing Alexandria knowledge.",
			"Use alexandria_create_note only with sanitized content; never include credentials, tokens, private keys, or raw .env values.",
		],
		parameters: CREATE_NOTE_PARAMS,
		async execute(_toolCallId, params: CreateNoteParams) {
			const result = await createNote(params);
			return {
				content: [{ type: "text", text: formatCreateNote(result) }],
				details: result,
			};
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("alexandria_create_note ")) + theme.fg("accent", args.path), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as CreateNoteResult | undefined;
			if (!details) return new Text(theme.fg("dim", "Alexandria note write complete"), 0, 0);
			return new Text(theme.fg("success", `${details.overwritten ? "overwritten" : "created"}: ${details.path}`), 0, 0);
		},
	});

	pi.registerTool({
		name: "alexandria_append_training_record",
		label: "Alexandria Append Training Record",
		description:
			"Append a sanitized PI Composer training JSONL record to Alexandria. Blocks secret-like content and stores a structured system/user/assistant record.",
		promptSnippet: "Append a sanitized PI Composer training JSONL record to Alexandria",
		promptGuidelines: [
			"Use alexandria_append_training_record only for reviewed and sanitized PI Composer examples.",
			"Never include personal data, credentials, tokens, private keys, raw URLs with credentials, or raw .env values in alexandria_append_training_record.",
		],
		parameters: APPEND_TRAINING_RECORD_PARAMS,
		async execute(_toolCallId, params: AppendTrainingRecordParams) {
			const result = await appendTrainingRecord(params);
			return {
				content: [{ type: "text", text: formatTrainingRecord(result) }],
				details: result,
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("alexandria_append_training_record")), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as AppendTrainingRecordResult | undefined;
			if (!details) return new Text(theme.fg("dim", "Training record appended"), 0, 0);
			return new Text(theme.fg("success", `appended: ${details.path}`), 0, 0);
		},
	});
}
