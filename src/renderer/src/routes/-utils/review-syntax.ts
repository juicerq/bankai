import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type { DiffLine } from "@main/git/git-contracts";
import { REVIEW_LANGUAGE_LOADERS, type ReviewLanguage } from "@renderer/routes/-utils/review-language";

const SYNTAX_TONES = ["plain", "comment", "keyword", "string", "constant", "entity", "type"] as const;

export type SyntaxTone = (typeof SYNTAX_TONES)[number];
export interface SyntaxSpan { length: number; tone: SyntaxTone }
export type HighlightedLines = SyntaxSpan[][];

const COLORS: Record<SyntaxTone, string> = {
	plain: "#000001",
	comment: "#000002",
	keyword: "#000003",
	string: "#000004",
	constant: "#000005",
	entity: "#000006",
	type: "#000007",
};

const TONE_BY_COLOR: Record<string, SyntaxTone> = Object.fromEntries(
	SYNTAX_TONES.map((tone): [string, SyntaxTone] => [COLORS[tone], tone]),
);

const BANKAI_SYNTAX_THEME = {
	name: "bankai-syntax",
	type: "dark" as const,
	fg: COLORS.plain,
	bg: "#000000",
	settings: [
		{ settings: { foreground: COLORS.plain } },
		{ scope: ["comment", "punctuation.definition.comment"], settings: { foreground: COLORS.comment } },
		{ scope: ["keyword", "storage"], settings: { foreground: COLORS.keyword } },
		{ scope: ["string"], settings: { foreground: COLORS.string } },
		{ scope: ["constant"], settings: { foreground: COLORS.constant } },
		{ scope: ["entity.name.function", "support.function"], settings: { foreground: COLORS.entity } },
		{
			scope: ["entity.name.type", "entity.other.inherited-class", "support.type", "support.class"],
			settings: { foreground: COLORS.type },
		},
	],
};

const highlighterPromise = createHighlighterCore({
	themes: [BANKAI_SYNTAX_THEME],
	langs: [],
	engine: createJavaScriptRegexEngine(),
});

const languageLoads = new Map<ReviewLanguage, Promise<void>>();

async function loadLanguage(language: ReviewLanguage) {
	const existing = languageLoads.get(language);
	if (existing) {
		return await existing;
	}

	const loading = highlighterPromise.then(async (highlighter) => {
		await highlighter.loadLanguage(REVIEW_LANGUAGE_LOADERS[language]);
	});
	languageLoads.set(language, loading);

	return await loading;
}

export async function highlightDiff(lines: DiffLine[], language: ReviewLanguage): Promise<HighlightedLines> {
	await loadLanguage(language);
	const highlighter = await highlighterPromise;
	const highlighted: HighlightedLines = [];
	let oldState: Parameters<typeof highlighter.codeToTokensBase>[1]["grammarState"];
	let newState: Parameters<typeof highlighter.codeToTokensBase>[1]["grammarState"];
	let hunk = -1;

	for (const line of lines) {
		if (line.hunk !== hunk) {
			hunk = line.hunk;
			oldState = undefined;
			newState = undefined;
		}

		if (line.kind !== "add") {
			const tokens = highlighter.codeToTokensBase(line.content, {
				lang: language,
				theme: BANKAI_SYNTAX_THEME,
				grammarState: oldState,
				tokenizeMaxLineLength: 2000,
				tokenizeTimeLimit: 0,
			});
			oldState = highlighter.getLastGrammarState(tokens);
			if (!oldState) {
				throw new Error("Missing old grammar state");
			}

			if (line.kind === "remove") {
				highlighted.push(spans(tokens[0] ?? []));
				continue;
			}
		}

		const tokens = highlighter.codeToTokensBase(line.content, {
			lang: language,
			theme: BANKAI_SYNTAX_THEME,
			grammarState: newState,
			tokenizeMaxLineLength: 2000,
			tokenizeTimeLimit: 0,
		});
		newState = highlighter.getLastGrammarState(tokens);
		if (!newState) {
			throw new Error("Missing new grammar state");
		}

		highlighted.push(spans(tokens[0] ?? []));
	}

	return highlighted;
}

function spans(tokens: { content: string; color?: string }[]): SyntaxSpan[] {
	const result: SyntaxSpan[] = [];

	for (const token of tokens) {
		const tone = TONE_BY_COLOR[token.color?.toLowerCase() ?? ""] ?? "plain";
		const previous = result.at(-1);
		if (previous?.tone === tone) {
			previous.length += token.content.length;
		} else {
			result.push({ length: token.content.length, tone });
		}
	}

	return result;
}
