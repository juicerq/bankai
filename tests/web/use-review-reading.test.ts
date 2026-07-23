import { type } from "arktype";
import { afterEach, expect, test } from "bun:test";
import type { ReviewContent, ReviewFiles, ReviewSnapshot } from "@main/git/contracts";
import { cleanup, waitFor } from "./testing-library";
import { renderReviewReading, type ReviewReadingProps } from "./review-harness";

afterEach(cleanup);

const modeInput = type({ mode: "string" });
const pathInput = type({ path: "string" });

const openAll = () => true;

function wait(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

function closing(closed: string[]) {
	return (path: string) => !closed.includes(path);
}

function snapshotOf(paths: string[]): ReviewSnapshot {
	return {
		isRepo: true,
		files: paths.map((path) => ({ path, status: "modified", additions: 1, deletions: 0 })),
		totals: { additions: paths.length, deletions: 0, files: paths.length },
	};
}

function readyContent(text: string): ReviewContent {
	return { status: "ready", lines: [{ kind: "add", number: 1, hunk: 1, content: text }] };
}

function filesResponse(entries: Record<string, string>): ReviewFiles {
	return { files: Object.entries(entries).map(([path, text]) => ({ path, content: readyContent(text) })) };
}

function contentText(content?: ReviewContent) {
	if (!content) {
		return;
	}

	if (content.status === "ready") {
		return content.lines[0]?.content;
	}

	return content.status;
}

type View = ReturnType<typeof renderReviewReading>;

async function reachReady(view: View) {
	view.ipc.resolveWatch();
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
}

async function settle(view: View, paths: string[], texts?: Record<string, string>) {
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(paths));
	await waitFor(() => expect(view.result.current.generation?.snapshot.files.length).toBe(paths.length));

	const open = paths.filter((path) => (texts ? path in texts : true));
	if (open.length > 0) {
		await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));
		view.transport.resolve("files", filesResponse(texts ?? Object.fromEntries(paths.map((path) => [path, path]))));
	}
	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(open.length));
}

function base(overrides: Partial<ReviewReadingProps>): ReviewReadingProps {
	return { projectId: "p1", mode: "uncommitted", isFileOpen: openAll, ...overrides };
}

test("the change listener is installed before watch is invoked", () => {
	const view = renderReviewReading(base({}));

	expect(view.ipc.events).toEqual(["listen", "watch"]);
	expect(view.ipc.watchCalls).toEqual(["p1"]);
	expect(view.ipc.listenerCount).toBe(1);
});

test("no reads happen before watch succeeds", async () => {
	const view = renderReviewReading(base({}));

	await wait(20);

	expect(view.transport.calls).toEqual([]);
	expect(view.result.current.generation).toBeUndefined();
});

test("unmount unwatches exactly once", async () => {
	const view = renderReviewReading(base({}));
	await reachReady(view);

	view.unmount();

	expect(view.ipc.unwatchCalls).toEqual(["p1"]);
});

test("unwatch happens once when watch completes after unmount", async () => {
	const view = renderReviewReading(base({}));
	expect(view.ipc.pendingWatchCount).toBe(1);

	view.unmount();
	expect(view.ipc.unwatchCalls).toEqual([]);

	view.ipc.resolveWatch();
	await wait(10);

	expect(view.ipc.unwatchCalls).toEqual(["p1"]);
});

test("change events for other projects are ignored", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	const callsBefore = view.transport.calls.length;
	view.ipc.emitChange("other-project");
	await wait(20);

	expect(view.transport.calls.length).toBe(callsBefore);
});

test("the initial batch reads exactly the ordered open paths with no single reads", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]) }));
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]));

	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));

	expect(view.transport.callsFor("files")).toEqual([{ projectId: "p1", files: ["a", "b"], mode: "uncommitted" }]);
	expect(view.transport.callsFor("file")).toEqual([]);
});

test("opening a not-yet-read file withholds content until it settles", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]) }));
	await settle(view, ["a", "b", "c"], { a: "a", b: "b" });

	view.rerender(base({ isFileOpen: openAll }));

	await waitFor(() => expect(view.transport.pendingCount("file")).toBe(1));
	expect(view.transport.callsFor("file")).toEqual([{ projectId: "p1", path: "c", mode: "uncommitted" }]);
	expect(view.result.current.generation?.contentByPath).toBeUndefined();

	view.transport.resolve("file", readyContent("c"));

	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(3));
	expect(contentText(view.result.current.generation?.contentByPath?.get("c"))).toBe("c");
});

test("closing then reopening a batched file does not trigger a duplicate single read", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	view.rerender(base({ isFileOpen: closing(["a"]) }));
	view.rerender(base({ isFileOpen: openAll }));

	await wait(20);

	expect(view.transport.callsFor("file")).toEqual([]);
	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a");
});

test("a failed batch read marks every requested path unavailable", async () => {
	const view = renderReviewReading(base({}));
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(["a", "b"]));

	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));
	view.transport.reject("files", new Error("batch failed"));

	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(2));
	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("unavailable");
	expect(contentText(view.result.current.generation?.contentByPath?.get("b"))).toBe("unavailable");
});

test("a failed single read marks only its own path unavailable", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]) }));
	await settle(view, ["a", "b", "c"], { a: "a", b: "b" });

	view.rerender(base({ isFileOpen: openAll }));
	await waitFor(() => expect(view.transport.pendingCount("file")).toBe(1));
	view.transport.reject("file", new Error("single failed"));

	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(3));
	expect(contentText(view.result.current.generation?.contentByPath?.get("c"))).toBe("unavailable");
	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a");
});

test("a single-read refetch failure keeps the cached content", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]) }));
	await settle(view, ["a", "b", "c"], { a: "a", b: "b" });

	view.rerender(base({ isFileOpen: openAll }));
	await waitFor(() => expect(view.transport.pendingCount("file")).toBe(1));
	view.transport.resolve("file", readyContent("c-original"));
	await waitFor(() => expect(contentText(view.result.current.generation?.contentByPath?.get("c"))).toBe("c-original"));

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("file")).toBeGreaterThan(0));
	view.transport.reject("file", new Error("refetch failed"));
	await wait(20);

	expect(contentText(view.result.current.generation?.contentByPath?.get("c"))).toBe("c-original");
});

test("a two-file watcher refresh never publishes a mixed generation", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["a", "b"]));

	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));
	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a1");
	expect(contentText(view.result.current.generation?.contentByPath?.get("b"))).toBe("b1");

	view.transport.resolve("files", filesResponse({ a: "a2", b: "b2" }));
	await waitFor(() => expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a2"));

	for (const reading of view.renders) {
		const map = reading.generation?.contentByPath;
		if (!map) {
			continue;
		}

		const a = contentText(map.get("a"));
		const b = contentText(map.get("b"));
		expect([undefined, "a1"].includes(a) === [undefined, "b1"].includes(b)).toBe(true);
	}
});

test("the last complete generation stays published while a refresh is in flight", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));

	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a1");
	expect(view.result.current.generation?.contentByPath?.size).toBe(2);
});

test("overlapping change events coalesce to the latest snapshot", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.ipc.emitChange("p1");
	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBeGreaterThan(0));

	while (view.transport.pendingCount("snapshot") > 0) {
		view.transport.resolve("snapshot", snapshotOf(["a", "b"]));
	}
	await waitFor(() => expect(view.transport.pendingCount("files")).toBeGreaterThan(0));
	while (view.transport.pendingCount("files") > 0) {
		view.transport.resolve("files", filesResponse({ a: "a2", b: "b2" }));
	}

	await waitFor(() => expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a2"));
	expect(view.result.current.error).toBeUndefined();
});

test("a change event refreshes all four query families", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]), focusedPath: "a" }));
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]));
	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));
	view.transport.resolve("files", filesResponse({ a: "a", b: "b" }));
	view.rerender(base({ isFileOpen: openAll, focusedPath: "a" }));
	await waitFor(() => expect(view.transport.pendingCount("file")).toBe(1));
	view.transport.resolve("file", readyContent("c"));
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.resolve("fullFile", readyContent("full-a"));
	await waitFor(() => expect(view.result.current.fullFile).toBeDefined());

	const before = {
		snapshot: view.transport.callsFor("snapshot").length,
		files: view.transport.callsFor("files").length,
		file: view.transport.callsFor("file").length,
		fullFile: view.transport.callsFor("fullFile").length,
	};

	view.ipc.emitChange("p1");

	await waitFor(() => expect(view.transport.callsFor("snapshot").length).toBeGreaterThan(before.snapshot));
	await waitFor(() => expect(view.transport.callsFor("files").length).toBeGreaterThan(before.files));
	await waitFor(() => expect(view.transport.callsFor("file").length).toBeGreaterThan(before.file));
	await waitFor(() => expect(view.transport.callsFor("fullFile").length).toBeGreaterThan(before.fullFile));
});

test("switching mode keeps the previous snapshot while withholding cross-mode content", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a-unc", b: "b-unc" });

	view.rerender(base({ mode: "branch" }));

	await waitFor(() =>
		expect(view.transport.callsFor("snapshot").some((input) => modeInput.assert(input).mode === "branch")).toBe(
			true,
		),
	);
	expect(view.result.current.generation?.snapshot.files.map((file) => file.path)).toEqual(["a", "b"]);
	expect(view.result.current.generation?.contentByPath).toBeUndefined();
	expect(view.transport.callsFor("files").filter((input) => modeInput.assert(input).mode === "branch")).toEqual([]);

	view.transport.resolve("snapshot", snapshotOf(["x", "y"]), (input) => modeInput.assert(input).mode === "branch");
	await waitFor(() => expect(view.result.current.generation?.snapshot.files.map((file) => file.path)).toEqual(["x", "y"]));
	await waitFor(() =>
		expect(view.transport.callsFor("files").some((input) => modeInput.assert(input).mode === "branch")).toBe(true),
	);
	view.transport.resolve("files", filesResponse({ x: "x-branch", y: "y-branch" }));
	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(2));

	for (const reading of view.renders) {
		const files = reading.generation?.snapshot.files.map((file) => file.path);
		if (files?.join() === "a,b") {
			expect(reading.generation?.contentByPath?.has("x")).not.toBe(true);
		}
	}
});

test("watch errors take precedence over snapshot and full-file output", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));

	view.ipc.rejectWatch(new Error("watch broke"));
	await waitFor(() => expect(view.result.current.error).toBeDefined());

	expect(view.result.current.error).toContain("watch broke");
	expect(view.result.current.generation).toBeUndefined();
	expect(view.result.current.fullFile).toBeUndefined();
});

test("a snapshot query error is surfaced while retained data still wins", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a", b: "b" });

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.reject("snapshot", new Error("snapshot broke"));

	await waitFor(() => expect(view.result.current.error).toBeDefined());
	expect(view.result.current.generation?.snapshot.files.map((file) => file.path)).toEqual(["a", "b"]);
});

test("a full file is gated on a focused path and read when one is set", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	expect(view.transport.callsFor("fullFile")).toEqual([]);

	view.rerender(base({ focusedPath: "a" }));
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.resolve("fullFile", readyContent("full-a"));

	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("full-a"));
});

test("switching the focused path shows no stale full file", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));
	await settle(view, ["a", "b"]);
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.resolve("fullFile", readyContent("full-a"));
	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("full-a"));

	view.rerender(base({ focusedPath: "b" }));

	await waitFor(() =>
		expect(view.transport.callsFor("fullFile").some((input) => pathInput.assert(input).path === "b")).toBe(true),
	);
	expect(view.result.current.fullFile).toBeUndefined();

	view.transport.resolve("fullFile", readyContent("full-b"), (input) => pathInput.assert(input).path === "b");
	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("full-b"));
});

test("a cold full-file error keeps the full file undefined", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));
	await settle(view, ["a", "b"]);
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.reject("fullFile", new Error("full file broke"));

	await wait(20);
	expect(view.result.current.fullFile).toBeUndefined();
});

test("a full-file refetch error keeps the cached full file", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));
	await settle(view, ["a", "b"]);
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.resolve("fullFile", readyContent("full-a"));
	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("full-a"));

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBeGreaterThan(0));
	view.transport.reject("fullFile", new Error("refetch broke"));
	await wait(20);

	expect(contentText(view.result.current.fullFile)).toBe("full-a");
});

test("the layout generation advances only on path-list or mode changes", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });
	const first = view.result.current.generation?.layoutGeneration;

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["a", "b"]));
	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));
	view.transport.resolve("files", filesResponse({ a: "a2", b: "b2" }));
	await waitFor(() => expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a2"));
	expect(view.result.current.generation?.layoutGeneration).toBe(first);

	view.ipc.emitChange("p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]));
	await waitFor(() => expect(view.result.current.generation?.snapshot.files.length).toBe(3));
	expect(view.result.current.generation?.layoutGeneration).toBe((first ?? 0) + 1);

	view.rerender(base({ mode: "branch" }));
	await waitFor(() =>
		expect(view.transport.callsFor("snapshot").some((input) => modeInput.assert(input).mode === "branch")).toBe(
			true,
		),
	);
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]), (input) => modeInput.assert(input).mode === "branch");
	await waitFor(() => expect(view.result.current.generation?.layoutGeneration).toBe((first ?? 0) + 2));
});
