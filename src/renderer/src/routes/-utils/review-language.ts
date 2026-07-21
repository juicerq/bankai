export const REVIEW_LANGUAGE_LOADERS = {
	bash: () => import("@shikijs/langs/bash"),
	c: () => import("@shikijs/langs/c"),
	cpp: () => import("@shikijs/langs/cpp"),
	csharp: () => import("@shikijs/langs/csharp"),
	css: () => import("@shikijs/langs/css"),
	dockerfile: () => import("@shikijs/langs/dockerfile"),
	go: () => import("@shikijs/langs/go"),
	html: () => import("@shikijs/langs/html"),
	java: () => import("@shikijs/langs/java"),
	javascript: () => import("@shikijs/langs/javascript"),
	json: () => import("@shikijs/langs/json"),
	jsonc: () => import("@shikijs/langs/jsonc"),
	jsx: () => import("@shikijs/langs/jsx"),
	markdown: () => import("@shikijs/langs/markdown"),
	python: () => import("@shikijs/langs/python"),
	ruby: () => import("@shikijs/langs/ruby"),
	rust: () => import("@shikijs/langs/rust"),
	scss: () => import("@shikijs/langs/scss"),
	sql: () => import("@shikijs/langs/sql"),
	tsx: () => import("@shikijs/langs/tsx"),
	typescript: () => import("@shikijs/langs/typescript"),
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
