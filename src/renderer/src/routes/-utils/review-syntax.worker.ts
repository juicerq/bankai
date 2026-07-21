import { highlightDiff, type HighlightedLines } from "@renderer/routes/-utils/review-syntax";
import type { DiffLine } from "@main/git/Git";
import type { ReviewLanguage } from "@renderer/routes/-utils/review-language";

export type ReviewSyntaxRequest = { id: number; lines: DiffLine[]; language: ReviewLanguage };
export type ReviewSyntaxResponse = { id: number; highlights: HighlightedLines | null };

self.addEventListener("message", async (event: MessageEvent<ReviewSyntaxRequest>) => {
	const { id, lines, language } = event.data;
	const highlights = await highlightDiff(lines, language).catch(() => null);
	self.postMessage({ id, highlights } satisfies ReviewSyntaxResponse, { transfer: [] });
});
