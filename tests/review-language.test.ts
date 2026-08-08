import { describe, expect, it } from "bun:test";
import { REVIEW_LANGUAGE_LOADERS, reviewLanguage } from "@renderer/routes/-features/review/reading/review-language";

const PREVIOUSLY_COVERED_EXTENSIONS = {
	bash: "bash",
	c: "c",
	cc: "cpp",
	cjs: "javascript",
	cpp: "cpp",
	cs: "csharp",
	css: "css",
	cts: "typescript",
	cxx: "cpp",
	go: "go",
	h: "c",
	hpp: "cpp",
	html: "html",
	htm: "html",
	java: "java",
	js: "javascript",
	json: "json",
	jsonc: "jsonc",
	jsx: "jsx",
	md: "markdown",
	mjs: "javascript",
	mts: "typescript",
	py: "python",
	rb: "ruby",
	rs: "rust",
	scss: "scss",
	sh: "bash",
	sql: "sql",
	ts: "typescript",
	tsx: "tsx",
	xhtml: "html",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
	zsh: "bash",
} as const;

const NEWLY_COVERED_EXTENSIONS = {
	toml: "toml",
	lua: "lua",
	vue: "vue",
	svelte: "svelte",
	kt: "kotlin",
	swift: "swift",
	php: "php",
	graphql: "graphql",
	proto: "proto",
	ini: "ini",
	env: "dotenv",
} as const;

describe("review language", () => {
	it("keeps the previously covered extensions on their existing grammar", () => {
		for (const [extension, language] of Object.entries(PREVIOUSLY_COVERED_EXTENSIONS)) {
			expect(reviewLanguage(`file.${extension}`)).toBe(language);
		}
	});

	it("resolves the 11 newly covered extensions to a grammar id", () => {
		for (const [extension, language] of Object.entries(NEWLY_COVERED_EXTENSIONS)) {
			expect(reviewLanguage(`file.${extension}`)).toBe(language);
		}
	});

	it("loads a real @shikijs/langs grammar for every newly covered language id", async () => {
		for (const language of new Set(Object.values(NEWLY_COVERED_EXTENSIONS))) {
			const loaded = await REVIEW_LANGUAGE_LOADERS[language]();

			expect(loaded.default[0]?.scopeName).toBeTruthy();
		}
	});
});
