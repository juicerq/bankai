import {
	addDefaultParsers,
	getTreeSitterClient,
	pathToFiletype,
	type SyntaxStyle,
	type TextChunk,
	treeSitterToStyledText,
} from "@opentui/core";
import { EXTRA_PARSERS, PARSER_CACHE_DIR } from "@core/highlight/parsers";

function chunkLines(chunks: TextChunk[]): TextChunk[][] {
	const lines: TextChunk[][] = [[]];

	for (const chunk of chunks) {
		chunk.text.split("\n").forEach((part, i) => {
			if (i > 0) {
				lines.push([]);
			}

			if (part !== "") {
				lines.at(-1)!.push({ ...chunk, text: part });
			}
		});
	}

	return lines;
}

class SyntaxHighlighter {
	private readonly client = getTreeSitterClient();
	private initialization: Promise<void> | null = null;
	private readonly cache = new WeakMap<SyntaxStyle, WeakMap<string[], Map<string, {
		request: Promise<TextChunk[][] | null>;
		result?: TextChunk[][] | null;
	}>>>();

	peek(
		file: { path: string; after: string[] },
		style: SyntaxStyle,
	): TextChunk[][] | null | undefined {
		return this.cache.get(style)?.get(file.after)?.get(file.path)?.result;
	}

	private async initialize(): Promise<void> {
		if (!this.initialization) {
			addDefaultParsers(EXTRA_PARSERS);
			this.initialization = this.client.setDataPath(PARSER_CACHE_DIR)
				.then(() => this.client.initialize())
				.catch((error) => {
					this.initialization = null;
					throw error;
				});
		}

		await this.initialization;
	}

	lines(
		file: { path: string; after: string[] },
		style: SyntaxStyle,
	) {
		const files = this.cache.get(style) ?? new WeakMap();
		this.cache.set(style, files);
		const paths = files.get(file.after) ?? new Map();
		files.set(file.after, paths);
		const existing = paths.get(file.path);
		if (existing) {
			return existing.request;
		}

		const request = this.highlight(file, style).then((lines) => {
			paths.set(file.path, { request, result: lines });
			return lines;
		}).catch((error) => {
			paths.delete(file.path);
			throw error;
		});
		paths.set(file.path, { request });
		return request;
	}

	private async highlight(
		file: { path: string; after: string[] },
		style: SyntaxStyle,
	) {
		const filetype = pathToFiletype(file.path);
		if (!filetype) {
			return null;
		}

		await this.initialize();

		const hasParser = await this.client.preloadParser(filetype);
		if (!hasParser) {
			return null;
		}

		const styled = await treeSitterToStyledText(
			file.after.join("\n"),
			filetype,
			style,
			this.client,
			{ conceal: { enabled: false } },
		);

		return chunkLines(styled.chunks);
	}
}

export const Highlighter = new SyntaxHighlighter();
