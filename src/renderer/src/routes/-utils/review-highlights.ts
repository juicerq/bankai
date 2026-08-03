import type { DiffLine } from "@main/git/git-contracts";
import { reviewLanguage } from "@renderer/routes/-utils/review-language";
import type { HighlightedLines } from "@renderer/routes/-utils/review-syntax";
import type { ReviewSyntaxRequest, ReviewSyntaxResponse } from "@renderer/routes/-utils/review-syntax.worker";

const cache = new WeakMap<DiffLine[], Promise<HighlightedLines | null>>();
const pending = new Map<number, { lines: DiffLine[]; resolve: (highlights: HighlightedLines | null) => void }>();
let nextId = 0;
let worker: Worker | undefined;

export function reviewHighlights(path: string, lines: DiffLine[]): Promise<HighlightedLines | null> | undefined {
	const language = reviewLanguage(path);
	if (!language) {
		return;
	}

	const cached = cache.get(lines);
	if (cached) {
		return cached;
	}

	const request = new Promise<HighlightedLines | null>((resolve) => {
		const id = nextId++;
		pending.set(id, { lines, resolve });
		syntaxWorker().postMessage({ id, lines, language } satisfies ReviewSyntaxRequest, { transfer: [] });
	});
	cache.set(lines, request);

	return request;
}

function syntaxWorker(): Worker {
	if (worker) {
		return worker;
	}

	worker = new Worker(new URL("./review-syntax.worker.ts", import.meta.url), { type: "module" });
	worker.addEventListener("message", (event: MessageEvent<ReviewSyntaxResponse>) => {
		pending.get(event.data.id)?.resolve(event.data.highlights);
		pending.delete(event.data.id);
	});
	worker.addEventListener("error", resetWorker);

	return worker;
}

function resetWorker() {
	for (const request of pending.values()) {
		request.resolve(null);
		setTimeout(() => cache.delete(request.lines), 0);
	}
	pending.clear();
	worker?.terminate();
	worker = undefined;
}
