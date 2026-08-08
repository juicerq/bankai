import { highlightDiff, type HighlightedLines } from "@renderer/routes/-features/review/reading/review-syntax";
import type { DiffLine } from "@shared/review";
import type { ReviewLanguage } from "@renderer/routes/-features/review/reading/review-language";

export interface ReviewSyntaxRequest { id: number; lines: DiffLine[]; language: ReviewLanguage }
export interface ReviewSyntaxResponse { id: number; highlights: HighlightedLines | null }

self.addEventListener("message", (event: MessageEvent<ReviewSyntaxRequest>) => {
	const { id, lines, language } = event.data;

	void highlightDiff(lines, language).catch(() => null).then((highlights) => {
		self.postMessage({ id, highlights } satisfies ReviewSyntaxResponse, { transfer: [] });
	});
});
