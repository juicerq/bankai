import type { DiffLine } from "@shared/review";
import { reviewLanguage } from "@renderer/routes/-features/review/reading/review-language";
import type { HighlightedLines } from "@renderer/routes/-features/review/reading/review-syntax";
import type { ReviewSyntaxRequest, ReviewSyntaxResponse } from "@renderer/routes/-features/review/reading/review-syntax.worker";

interface PendingHighlight { key: string; request: Promise<HighlightedLines | null>; resolve: (highlights: HighlightedLines | null) => void }

export const HIGHLIGHT_CACHE_LIMIT = 256;

const keys = new WeakMap<DiffLine[], string>();
const cache = new Map<string, Promise<HighlightedLines | null>>();
const pending = new Map<number, PendingHighlight>();
let nextId = 0;
let worker: Worker | undefined;

export function reviewHighlights(path: string, lines: DiffLine[]): Promise<HighlightedLines | null> | undefined {
	const language = reviewLanguage(path);
	if (!language) {
		return;
	}

	const key = keys.get(lines) ?? highlightKey(path, lines);
	keys.set(lines, key);

	const cached = cache.get(key);
	if (cached) {
		remember(key, cached);

		return cached;
	}

	const { promise, resolve } = Promise.withResolvers<HighlightedLines | null>();
	const id = nextId++;
	syntaxWorker().postMessage({ id, lines, language } satisfies ReviewSyntaxRequest, { transfer: [] });
	pending.set(id, { key, request: promise, resolve });
	remember(key, promise);

	return promise;
}

function highlightKey(path: string, lines: DiffLine[]): string {
	const signature = lines.map((line) => `${line.kind} ${line.hunk} ${line.content}`).join("\n");

	return `${path.length} ${path} ${signature}`;
}

function remember(key: string, request: Promise<HighlightedLines | null>) {
	cache.delete(key);
	cache.set(key, request);

	if (cache.size <= HIGHLIGHT_CACHE_LIMIT) {
		return;
	}

	const oldest = cache.keys().next().value;
	if (oldest !== undefined) {
		cache.delete(oldest);
	}
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
	for (const entry of pending.values()) {
		entry.resolve(null);
		setTimeout(() => {
			if (cache.get(entry.key) === entry.request) {
				cache.delete(entry.key);
			}
		}, 0);
	}
	pending.clear();
	worker?.terminate();
	worker = undefined;
}
