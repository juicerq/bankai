import { homedir } from "node:os";
import { join } from "node:path";

const QUERIES = "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries";

export const PARSER_CACHE_DIR = join(
	process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
	"bankai",
	"parsers",
);

export const EXTRA_PARSERS = [
	{
		filetype: "json",
		wasm: "https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm",
		queries: { highlights: [`${QUERIES}/json/highlights.scm`] },
	},
	{
		filetype: "yaml",
		wasm: "https://github.com/tree-sitter-grammars/tree-sitter-yaml/releases/download/v0.7.2/tree-sitter-yaml.wasm",
		queries: { highlights: [`${QUERIES}/yaml/highlights.scm`] },
	},
	{
		filetype: "toml",
		wasm: "https://github.com/tree-sitter-grammars/tree-sitter-toml/releases/download/v0.7.0/tree-sitter-toml.wasm",
		queries: { highlights: [`${QUERIES}/toml/highlights.scm`] },
	},
	{
		filetype: "css",
		wasm: "https://github.com/tree-sitter/tree-sitter-css/releases/download/v0.25.0/tree-sitter-css.wasm",
		queries: { highlights: [`${QUERIES}/css/highlights.scm`] },
	},
	{
		filetype: "html",
		wasm: "https://github.com/tree-sitter/tree-sitter-html/releases/download/v0.23.2/tree-sitter-html.wasm",
		queries: {
			highlights: [
				"https://raw.githubusercontent.com/tree-sitter/tree-sitter-html/v0.23.2/queries/highlights.scm",
			],
		},
	},
	{
		filetype: "python",
		wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.25.0/tree-sitter-python.wasm",
		queries: {
			highlights: [
				"https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/v0.25.0/queries/highlights.scm",
			],
		},
	},
	{
		filetype: "go",
		wasm: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm",
		queries: { highlights: [`${QUERIES}/go/highlights.scm`] },
	},
	{
		filetype: "rust",
		wasm: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.2/tree-sitter-rust.wasm",
		queries: { highlights: [`${QUERIES}/rust/highlights.scm`] },
	},
	{
		filetype: "bash",
		wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.1/tree-sitter-bash.wasm",
		queries: { highlights: [`${QUERIES}/bash/highlights.scm`] },
	},
];
