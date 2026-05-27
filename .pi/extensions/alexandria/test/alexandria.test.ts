import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
	appendTrainingRecord,
	createNote,
	getVaultStatus,
	readNote,
	resolveVaultRelativePath,
	searchVault,
} from "../vault.ts";

async function withTempVault(run: (vaultDir: string) => Promise<void>): Promise<void> {
	const vaultDir = await mkdtemp(join(tmpdir(), "pi-alexandria-test-"));
	process.env.ALEXANDRIA_VAULT_DIR = vaultDir;
	try {
		await run(vaultDir);
	} finally {
		delete process.env.ALEXANDRIA_VAULT_DIR;
		await rm(vaultDir, { recursive: true, force: true });
	}
}

test("status reports empty vault", async () => {
	await withTempVault(async () => {
		const status = await getVaultStatus();
		assert.equal(status.ok, true);
		assert.equal(status.markdownCount, 0);
	});
});

test("create + read note flow", async () => {
	await withTempVault(async () => {
		const created = await createNote({
			path: "projetos/teste.md",
			title: "Teste",
			tipo: "projeto",
			tags: ["x", "y"],
			body: "Conteudo sanitizado.",
		});
		assert.equal(created.path, "projetos/teste.md");
		const note = await readNote("projetos/teste.md", 2000);
		assert.equal(note.path, "projetos/teste.md");
		assert.match(note.content, /Conteudo sanitizado/);
	});
});

test("search returns matching note", async () => {
	await withTempVault(async () => {
		await createNote({
			path: "agentes/pi-composer/nota.md",
			title: "PI Composer",
			tipo: "meta",
			tags: ["pi-composer"],
			body: "Arquitetura PI Composer com runbook e benchmark.",
		});
		const results = await searchVault("benchmark", 10);
		assert.equal(results.length, 1);
		assert.equal(results[0]?.path, "agentes/pi-composer/nota.md");
	});
});

test("path traversal is blocked", async () => {
	await withTempVault(async () => {
		assert.throws(() => resolveVaultRelativePath("../fora.md"), /escapes Alexandria vault root|Use a relative/);
	});
});

test("policy blocks arquivo paths", async () => {
	await withTempVault(async () => {
		assert.throws(() => resolveVaultRelativePath("arquivo/segredo.md"), /Path is blocked by policy/);
	});
});

test("secret-like note body is blocked", async () => {
	await withTempVault(async () => {
		await assert.rejects(
			() =>
				createNote({
					path: "meta/segredo.md",
					title: "Segredo",
					tipo: "meta",
					tags: ["segredo"],
					body: "OPENAI_API_KEY='sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
				}),
			/secret-like content/,
		);
	});
});

test("append training record writes valid jsonl", async () => {
	await withTempVault(async (vaultDir) => {
		const appended = await appendTrainingRecord({
			task: "Documentar fluxo de integração Alexandria no Pi com validação local.",
			context: "Vault temporário para teste automatizado.",
			plan: "Criar nota, buscar por termo e validar JSONL após append do registro sanitizado.",
			result: "Fluxo executado com sucesso, sem vazamento de segredo.",
			validation: "node --import tsx --test alexandria.test.ts",
			project: "pi",
			category: "testes",
		});
		assert.match(appended.path, /^agentes\/pi-composer\/records\//);

		const date = new Date().toISOString().slice(0, 10);
		const jsonlPath = join(vaultDir, "agentes", "pi-composer", "records", `${date}.jsonl`);
		const content = await readFile(jsonlPath, "utf8");
		const firstLine = content.trim().split("\n")[0] ?? "";
		assert.doesNotThrow(() => JSON.parse(firstLine));
	});
});
