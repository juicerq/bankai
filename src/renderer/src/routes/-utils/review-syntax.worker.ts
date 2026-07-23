import { highlightDiff, type HighlightedLines } from "@renderer/routes/-utils/review-syntax";
import type { DiffLine } from "@main/git/contracts";
import type { ReviewLanguage } from "@renderer/routes/-utils/review-language";

export interface ReviewSyntaxRequest { id: number; lines: DiffLine[]; language: ReviewLanguage }
export interface ReviewSyntaxResponse { id: number; highlights: HighlightedLines | null }

self.addEventListener("message", async (event: MessageEvent<ReviewSyntaxRequest>) => {
	const { id, lines, language } = event.data;
	const highlights = await highlightDiff(lines, language).catch(() => null);
	self.postMessage({ id, highlights } satisfies ReviewSyntaxResponse, { transfer: [] });
});
