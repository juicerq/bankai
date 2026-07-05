import hljs from "highlight.js/lib/common";

const EXT_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	css: "css",
	scss: "scss",
	html: "xml",
	xml: "xml",
	svg: "xml",
	md: "markdown",
	markdown: "markdown",
	py: "python",
	rs: "rust",
	go: "go",
	java: "java",
	rb: "ruby",
	php: "php",
	c: "c",
	h: "c",
	cpp: "cpp",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	fish: "bash",
	yml: "yaml",
	yaml: "yaml",
	toml: "ini",
	ini: "ini",
	sql: "sql",
	dockerfile: "dockerfile",
};

export function languageFor(path: string): string | undefined {
	const name = path.split("/").at(-1)?.toLowerCase() ?? "";
	const ext = name.includes(".") ? name.split(".").at(-1) : name;
	const lang = ext ? EXT_LANG[ext] : undefined;

	return lang && hljs.getLanguage(lang) ? lang : undefined;
}

export function highlightLine(
	text: string,
	language: string | undefined,
): string | null {
	if (!language || text === "") {
		return null;
	}

	return hljs.highlight(text, { language, ignoreIllegal: true }).value;
}
