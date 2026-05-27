export type SecretCategory =
	| "private-key"
	| "github-token"
	| "openai-or-compatible-key"
	| "huggingface-token"
	| "aws-access-key"
	| "database-url-with-password"
	| "generic-secret-assignment";

type SecretPattern = {
	category: SecretCategory;
	pattern: RegExp;
};

const SECRET_PATTERNS: SecretPattern[] = [
	{
		category: "private-key",
		pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
	},
	{
		category: "github-token",
		pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
	},
	{
		category: "openai-or-compatible-key",
		pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
	},
	{
		category: "huggingface-token",
		pattern: /\bhf_[A-Za-z0-9]{20,}\b/g,
	},
	{
		category: "aws-access-key",
		pattern: /\bAKIA[0-9A-Z]{16}\b/g,
	},
	{
		category: "database-url-with-password",
		pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@]+@[^\s]+/gi,
	},
	{
		category: "generic-secret-assignment",
		pattern:
			/\b(?:api[_-]?key|token|secret|password|passwd|pwd)\b\s*[:=]\s*["'][A-Za-z0-9_./+=-]{24,}["']/gi,
	},
];

export type RedactionResult = {
	text: string;
	categories: SecretCategory[];
};

export function redactSecrets(input: string): RedactionResult {
	let text = input;
	const categories = new Set<SecretCategory>();

	for (const { category, pattern } of SECRET_PATTERNS) {
		text = text.replace(pattern, () => {
			categories.add(category);
			return `[REDACTED:${category}]`;
		});
	}

	return { text, categories: [...categories].sort() };
}

export function detectSecretCategories(input: string): SecretCategory[] {
	const categories = new Set<SecretCategory>();
	for (const { category, pattern } of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		if (pattern.test(input)) {
			categories.add(category);
		}
	}
	return [...categories].sort();
}

export function assertNoSecrets(input: string, label: string): void {
	const categories = detectSecretCategories(input);
	if (categories.length > 0) {
		throw new Error(`${label} contains secret-like content: ${categories.join(", ")}`);
	}
}
