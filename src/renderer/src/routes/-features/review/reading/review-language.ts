export const REVIEW_LANGUAGE_LOADERS = {
	bash: () => import("@shikijs/langs/bash"),
	c: () => import("@shikijs/langs/c"),
	cpp: () => import("@shikijs/langs/cpp"),
	csharp: () => import("@shikijs/langs/csharp"),
	css: () => import("@shikijs/langs/css"),
	dockerfile: () => import("@shikijs/langs/dockerfile"),
	dotenv: () => import("@shikijs/langs/dotenv"),
	go: () => import("@shikijs/langs/go"),
	graphql: () => import("@shikijs/langs/graphql"),
	html: () => import("@shikijs/langs/html"),
	ini: () => import("@shikijs/langs/ini"),
	java: () => import("@shikijs/langs/java"),
	javascript: () => import("@shikijs/langs/javascript"),
	json: () => import("@shikijs/langs/json"),
	jsonc: () => import("@shikijs/langs/jsonc"),
	jsx: () => import("@shikijs/langs/jsx"),
	kotlin: () => import("@shikijs/langs/kotlin"),
	lua: () => import("@shikijs/langs/lua"),
	markdown: () => import("@shikijs/langs/markdown"),
	php: () => import("@shikijs/langs/php"),
	prisma: () => import("@shikijs/langs/prisma"),
	proto: () => import("@shikijs/langs/proto"),
	python: () => import("@shikijs/langs/python"),
	ruby: () => import("@shikijs/langs/ruby"),
	rust: () => import("@shikijs/langs/rust"),
	scss: () => import("@shikijs/langs/scss"),
	sql: () => import("@shikijs/langs/sql"),
	svelte: () => import("@shikijs/langs/svelte"),
	swift: () => import("@shikijs/langs/swift"),
	toml: () => import("@shikijs/langs/toml"),
	tsx: () => import("@shikijs/langs/tsx"),
	typescript: () => import("@shikijs/langs/typescript"),
	vue: () => import("@shikijs/langs/vue"),
	xml: () => import("@shikijs/langs/xml"),
	yaml: () => import("@shikijs/langs/yaml"),
} as const;

export type ReviewLanguage = keyof typeof REVIEW_LANGUAGE_LOADERS;

const LANGUAGE_BY_EXTENSION: Record<string, ReviewLanguage> = {
	bash: "bash",
	c: "c",
	cc: "cpp",
	cjs: "javascript",
	cpp: "cpp",
	cs: "csharp",
	css: "css",
	cts: "typescript",
	cxx: "cpp",
	env: "dotenv",
	go: "go",
	graphql: "graphql",
	h: "c",
	hpp: "cpp",
	html: "html",
	htm: "html",
	ini: "ini",
	java: "java",
	js: "javascript",
	json: "json",
	jsonc: "jsonc",
	jsx: "jsx",
	kt: "kotlin",
	lua: "lua",
	md: "markdown",
	mjs: "javascript",
	mts: "typescript",
	php: "php",
	prisma: "prisma",
	proto: "proto",
	py: "python",
	rb: "ruby",
	rs: "rust",
	scss: "scss",
	sh: "bash",
	sql: "sql",
	svelte: "svelte",
	swift: "swift",
	toml: "toml",
	ts: "typescript",
	tsx: "tsx",
	vue: "vue",
	xhtml: "html",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
	zsh: "bash",
};

const LANGUAGE_BY_NAME: Record<string, ReviewLanguage> = {
	dockerfile: "dockerfile",
	"dockerfile.dev": "dockerfile",
};

export function reviewLanguage(path: string): ReviewLanguage | undefined {
	const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
	const exact = LANGUAGE_BY_NAME[name];
	if (!exact) {
		return LANGUAGE_BY_EXTENSION[name.slice(name.lastIndexOf(".") + 1)];
	}

	return exact;
}
