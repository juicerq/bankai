import { highlightDiff, type HighlightedLines } from "@renderer/routes/-utils/review-syntax";
import type { DiffLine } from "@main/git/git-contracts";
import type { ReviewLanguage } from "@renderer/routes/-utils/review-language";

export interface ReviewSyntaxRequest { id: number; lines: DiffLine[]; language: ReviewLanguage }
export interface ReviewSyntaxResponse { id: number; highlights: HighlightedLines | null }

self.addEventListener("message", (event: MessageEvent<ReviewSyntaxRequest>) => {
	const { id, lines, language } = event.data;

	void highlightDiff(lines, language).catch(() => null).then((highlights) => {
		self.postMessage({ id, highlights } satisfies ReviewSyntaxResponse, { transfer: [] });
	});
});
