import { beforeEach, expect, test } from "bun:test";
import type { DiffLine } from "@shared/review";
import { HIGHLIGHT_CACHE_LIMIT, reviewHighlights } from "@renderer/routes/-features/review/reading/review-highlights";
import type { HighlightedLines } from "@renderer/routes/-features/review/reading/review-syntax";
import type { ReviewSyntaxRequest, ReviewSyntaxResponse } from "@renderer/routes/-features/review/reading/review-syntax.worker";

const requests: ReviewSyntaxRequest[] = [];
let listeners: { type: string; run: (event: unknown) => void }[] = [];

class FakeSyntaxWorker {
	postMessage(request: ReviewSyntaxRequest, _options: StructuredSerializeOptions) {
		requests.push(request);
	}

	addEventListener(type: string, run: (event: unknown) => void) {
		listeners.push({ type, run });
	}

	terminate() {
		listeners = [];
	}
}

Object.defineProperty(globalThis, "Worker", { value: FakeSyntaxWorker });

beforeEach(() => {
	requests.length = 0;
});

function diffLines(contents: string[]): DiffLine[] {
	return contents.map((content, index) => ({
		kind: "context",
		number: index + 1,
		oldNumber: index + 1,
		hunk: 0,
		content,
	}));
}

function emit(type: string, event: unknown) {
	for (const listener of listeners.filter((listener) => listener.type === type)) {
		listener.run(event);
	}
}

function respond(id: number, highlights: HighlightedLines | null) {
	emit("message", { data: { id, highlights } satisfies ReviewSyntaxResponse });
}

function countedLines(contents: string[], reads: { count: number }): DiffLine[] {
	return contents.map((content, index) => ({
		kind: "context",
		number: index + 1,
		oldNumber: index + 1,
		hunk: 0,
		get content() {
			reads.count++;

			return content;
		},
	}));
}

test("a new array with the same content returns the same pending highlight", () => {
	const first = reviewHighlights("cache/pending.ts", diffLines(["const value = 1", "export default value"]));
	const second = reviewHighlights("cache/pending.ts", diffLines(["const value = 1", "export default value"]));

	expect(second).toBe(first);
	expect(requests).toHaveLength(1);
});

test("a settled highlight survives a new array as the same thenable", async () => {
	const first = reviewHighlights("cache/settled.ts", diffLines(["const settled = 1"]));
	const request = requests[0];
	if (!request) {
		throw new Error("No syntax request");
	}

	respond(request.id, [[{ length: 5, tone: "keyword" }]]);
	await first;

	const second = reviewHighlights("cache/settled.ts", diffLines(["const settled = 1"]));

	expect(second).toBe(first);
	expect(requests).toHaveLength(1);
	expect(await second).toEqual([[{ length: 5, tone: "keyword" }]]);
});

test("different content on the same path asks the worker again", () => {
	const first = reviewHighlights("cache/changed.ts", diffLines(["const before = 1"]));
	const second = reviewHighlights("cache/changed.ts", diffLines(["const after = 2"]));

	expect(second).not.toBe(first);
	expect(requests).toHaveLength(2);
});

test("the same array skips the content scan", () => {
	const reads = { count: 0 };
	const lines = countedLines(["const scanned = 1", "const twice = 2"], reads);

	const first = reviewHighlights("cache/scan.ts", lines);
	const afterFirst = reads.count;
	const second = reviewHighlights("cache/scan.ts", lines);

	expect(second).toBe(first);
	expect(afterFirst).toBeGreaterThan(0);
	expect(reads.count).toBe(afterFirst);
	expect(requests).toHaveLength(1);
});

test("a worker failure drops the cached highlight so the next read retries", async () => {
	const first = reviewHighlights("cache/failed.ts", diffLines(["const failed = 1"]));

	emit("error", new Error("worker crashed"));

	expect(await first).toBeNull();
	await new Promise((resolve) => setTimeout(resolve, 0));

	const second = reviewHighlights("cache/failed.ts", diffLines(["const failed = 1"]));

	expect(second).not.toBe(first);
	expect(requests).toHaveLength(2);
});

test("a worker failure drops every array that shares the failed highlight", async () => {
	const first = reviewHighlights("cache/aliased.ts", diffLines(["const aliased = 1"]));
	const onScreen = diffLines(["const aliased = 1"]);

	expect(reviewHighlights("cache/aliased.ts", onScreen)).toBe(first);

	emit("error", new Error("worker crashed"));

	expect(await first).toBeNull();
	await new Promise((resolve) => setTimeout(resolve, 0));

	const retried = reviewHighlights("cache/aliased.ts", onScreen);

	expect(retried).not.toBe(first);
	expect(requests).toHaveLength(2);
});

test("the diff hunk and the focused file of one path keep their own highlights", () => {
	const hunk = reviewHighlights("cache/shared.ts", diffLines(["const inside = 1"]));
	const whole = reviewHighlights(
		"cache/shared.ts",
		diffLines(["const before = 0", "const inside = 1", "const after = 2"]),
	);

	expect(whole).not.toBe(hunk);
	expect(requests).toHaveLength(2);
	expect(reviewHighlights("cache/shared.ts", diffLines(["const inside = 1"]))).toBe(hunk);
	expect(requests).toHaveLength(2);
});

test("a file without a known grammar is never sent to the worker", () => {
	expect(reviewHighlights("cache/data.unknown", diffLines(["plain text"]))).toBeUndefined();
	expect(requests).toHaveLength(0);
});

test("a full cache drops the file read longest ago", () => {
	void reviewHighlights("cache/evicted.ts", diffLines(["const evicted = 0"]));

	for (let index = 1; index <= HIGHLIGHT_CACHE_LIMIT; index++) {
		void reviewHighlights(`cache/browsed-${index}.ts`, diffLines([`const browsed = ${index}`]));
	}

	void reviewHighlights("cache/evicted.ts", diffLines(["const evicted = 0"]));

	expect(requests).toHaveLength(HIGHLIGHT_CACHE_LIMIT + 2);
});
