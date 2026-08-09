import "./register-dom";
import { type } from "arktype";
import { afterEach, expect, test } from "bun:test";
import type { QueryKey } from "@tanstack/react-query";
import type { ReviewContent, ReviewFiles, ReviewSnapshot } from "@shared/review";
import { orpc } from "@renderer/lib/api";
import { act, cleanup, waitFor } from "./testing-library";
import { renderReviewReading, type ReviewReadingProps } from "./review-harness";

afterEach(cleanup);

const modeInput = type({ mode: "string" });
const pathInput = type({ path: "string" });
const filesInput = type({ files: "string[]" });

const openAll = () => true;

function reading(paths: string[]) {
	return (input: unknown) => {
		const requested = filesInput.assert(input).files;

		return requested.length === paths.length && paths.every((path, index) => requested[index] === path);
	};
}

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
		state: "ready",
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

function exactReviewKeys(projectId: string, worktree: string): { name: string; key: QueryKey }[] {
	return [
		{
			name: "snapshot",
			key: orpc.review.snapshot.key({ type: "query", input: { projectId, worktree, mode: "branch" } }),
		},
		{
			name: "files",
			key: orpc.review.files.key({
				type: "query",
				input: { projectId, worktree, mode: "branch", files: ["a"] },
			}),
		},
		{
			name: "file",
			key: orpc.review.file.key({
				type: "query",
				input: { projectId, worktree, mode: "branch", path: "a" },
			}),
		},
		{
			name: "fullFile",
			key: orpc.review.fullFile.key({
				type: "query",
				input: { projectId, worktree, mode: "branch", path: "a" },
			}),
		},
		{
			name: "browseFiles",
			key: orpc.review.browseFiles.key({ type: "query", input: { projectId, worktree } }),
		},
		{
			name: "browseFile",
			key: orpc.review.browseFile.key({ type: "query", input: { projectId, worktree, path: "a" } }),
		},
		{
			name: "searchContent",
			key: orpc.review.searchContent.key({ type: "query", input: { projectId, worktree, query: "term" } }),
		},
	];
}

function startCachedReads(view: View, entries: { name: string; key: QueryKey }[], side: string) {
	const aborted = new Set<string>();

	for (const entry of entries) {
		void view.queryClient
			.fetchQuery({
				queryKey: entry.key,
				gcTime: Infinity,
				initialData: `${side}-${entry.name}`,
				initialDataUpdatedAt: 0,
				staleTime: 0,
				queryFn: ({ signal }) =>
					new Promise<string>((_resolve, reject) => {
						signal.addEventListener("abort", () => {
							aborted.add(entry.name);
							reject(signal.reason);
						});
					}),
			})
			.catch(() => {});
	}

	return aborted;
}

async function rejectRefetch(
	view: View,
	procedure: "file" | "browseFile" | "fullFile",
	error: Error,
	key: QueryKey,
) {
	await act(async () => {
		view.ipc.emitChange("p1", "/p1");
		await view.transport.waitForPending(procedure);

		const promise = view.queryClient.getQueryCache().find({ queryKey: key })?.promise;
		if (!promise) {
			throw new Error(`No pending ${procedure} query`);
		}

		const rendered = view.waitForRender();
		view.transport.reject(procedure, error);
		await promise.catch(() => {});
		await rendered;
	});
}

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
		await waitFor(() => expect(view.transport.callsFor("files").some(reading(open))).toBe(true));
		view.transport.resolve(
			"files",
			filesResponse(texts ?? Object.fromEntries(paths.map((path) => [path, path]))),
			reading(open),
		);
	}
	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(open.length));
}

function base(overrides: Partial<ReviewReadingProps>): ReviewReadingProps {
	return { projectId: "p1", worktree: "/p1", mode: "uncommitted", isFileOpen: openAll, ...overrides };
}

test("mounting watches the worktree once", () => {
	const view = renderReviewReading(base({}));

	expect(view.ipc.watchCalls).toEqual([{ projectId: "p1", worktree: "/p1" }]);
	expect(view.ipc.pendingWatchCount).toBe(1);
});

test("a change event arriving before watch resolves is still picked up", async () => {
	const view = renderReviewReading(base({}));

	view.ipc.emitChange("p1", "/p1");
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(["a"]));

	await waitFor(() => expect(view.result.current.generation?.snapshot.files.length).toBe(1));
});

test("no reads happen before watch succeeds", async () => {
	const view = renderReviewReading(base({}));

	await wait(20);

	expect(view.transport.calls).toEqual([]);
	expect(view.result.current.generation).toBeUndefined();
});

test("unmount unwatches exactly once and stops listening for changes", async () => {
	const view = renderReviewReading(base({}));
	await reachReady(view);

	view.unmount();

	expect(view.ipc.unwatchCalls).toEqual([{ projectId: "p1", worktree: "/p1" }]);

	const callsBefore = view.transport.calls.length;
	view.ipc.emitChange("p1", "/p1");
	await wait(20);

	expect(view.transport.calls.length).toBe(callsBefore);
});

test("unwatch happens once when watch completes after unmount", async () => {
	const view = renderReviewReading(base({}));
	expect(view.ipc.pendingWatchCount).toBe(1);

	view.unmount();
	expect(view.ipc.unwatchCalls).toEqual([]);

	view.ipc.resolveWatch();
	await wait(10);

	expect(view.ipc.unwatchCalls).toEqual([{ projectId: "p1", worktree: "/p1" }]);
});

test("change events for other projects are ignored", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	const callsBefore = view.transport.calls.length;
	view.ipc.emitChange("other-project", "/other-project");
	await wait(20);

	expect(view.transport.calls.length).toBe(callsBefore);
});

test("a change event for another worktree is ignored", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	const callsBefore = view.transport.calls.length;
	view.ipc.emitChange("p1", "/p1-other");
	await wait(20);

	expect(view.transport.calls.length).toBe(callsBefore);
});

test("a worktree change cancels and invalidates only its exact cached review reads", async () => {
	const view = renderReviewReading(base({ worktree: "/p1-a" }));
	await reachReady(view);

	const changed = exactReviewKeys("p1", "/p1-a");
	const unchanged = exactReviewKeys("p1", "/p1-b");
	const changedWorktrees: { name: string; key: QueryKey } = {
		name: "worktrees",
		key: orpc.review.worktrees.key({ type: "query", input: { projectId: "p1" } }),
	};
	const unchangedWorktrees: { name: string; key: QueryKey } = {
		name: "worktrees",
		key: orpc.review.worktrees.key({ type: "query", input: { projectId: "p2" } }),
	};
	const changedEntries = [...changed, changedWorktrees];
	const unchangedEntries = [...unchanged, unchangedWorktrees];
	const changedAborts = startCachedReads(view, changedEntries, "changed");
	const unchangedAborts = startCachedReads(view, unchangedEntries, "unchanged");

	await waitFor(() => {
		for (const entry of [...changedEntries, ...unchangedEntries]) {
			expect(view.queryClient.getQueryState(entry.key)?.fetchStatus).toBe("fetching");
		}
	});

	view.ipc.emitChange("p1", "/p1-a");

	await waitFor(() => expect(changedAborts.size).toBe(changedEntries.length));
	for (const entry of changedEntries) {
		expect(view.queryClient.getQueryState(entry.key)?.isInvalidated).toBe(true);
		expect(view.queryClient.getQueryData<string>(entry.key)).toBe(`changed-${entry.name}`);
	}
	for (const entry of unchangedEntries) {
		expect(view.queryClient.getQueryState(entry.key)?.isInvalidated).toBe(false);
		expect(view.queryClient.getQueryData<string>(entry.key)).toBe(`unchanged-${entry.name}`);
	}
	expect(unchangedAborts.size).toBe(0);

	await view.queryClient.cancelQueries();
});

test("the initial batch reads exactly the ordered open paths with no single reads", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]) }));
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]));

	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));

	expect(view.transport.callsFor("files")).toEqual([
		{ projectId: "p1", worktree: "/p1", files: ["a", "b"], mode: "uncommitted" },
	]);
	expect(view.transport.callsFor("file")).toEqual([]);
});

test("opening a not-yet-read file withholds content until it settles", async () => {
	const view = renderReviewReading(base({ isFileOpen: closing(["c"]) }));
	await settle(view, ["a", "b", "c"], { a: "a", b: "b" });

	view.rerender(base({ isFileOpen: openAll }));

	await waitFor(() => expect(view.transport.pendingCount("file")).toBe(1));
	expect(view.transport.callsFor("file")).toEqual([{ projectId: "p1", worktree: "/p1", path: "c", mode: "uncommitted" }]);
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

	await rejectRefetch(
		view,
		"file",
		new Error("refetch failed"),
		orpc.review.file.key({
			type: "query",
			input: { projectId: "p1", worktree: "/p1", mode: "uncommitted", path: "c" },
		}),
	);

	expect(contentText(view.result.current.generation?.contentByPath?.get("c"))).toBe("c-original");
});

test("a two-file watcher refresh never publishes a mixed generation", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.ipc.emitChange("p1", "/p1");
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

	view.ipc.emitChange("p1", "/p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));

	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a1");
	expect(view.result.current.generation?.contentByPath?.size).toBe(2);
});

test("overlapping change events coalesce to the latest snapshot", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.ipc.emitChange("p1", "/p1");
	view.ipc.emitChange("p1", "/p1");
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

	view.ipc.emitChange("p1", "/p1");

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

	view.ipc.emitChange("p1", "/p1");
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

test("a focused file outside the diff is read raw instead of as a full diff", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	view.rerender(base({ focusedPath: "docs/guide.md" }));

	await waitFor(() => expect(view.transport.pendingCount("browseFile")).toBe(1));
	expect(view.transport.callsFor("fullFile")).toEqual([]);

	view.transport.resolve("browseFile", readyContent("raw-guide"));
	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("raw-guide"));
});

test("a focused file outside the diff is read even when the snapshot query fails", async () => {
	const view = renderReviewReading(base({}));
	await reachReady(view);
	view.transport.reject("snapshot", new Error("snapshot broke"));
	await waitFor(() => expect(view.result.current.error).toBeDefined());

	view.rerender(base({ focusedPath: "docs/guide.md" }));

	await waitFor(() => expect(view.transport.pendingCount("browseFile")).toBe(1));
	view.transport.resolve("browseFile", readyContent("raw-guide"));

	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("raw-guide"));
});

test("a focused file outside the diff is read even when the watch fails", async () => {
	const view = renderReviewReading(base({}));
	view.ipc.rejectWatch(new Error("watch broke"));
	await waitFor(() => expect(view.result.current.error).toBeDefined());

	view.rerender(base({ focusedPath: "docs/guide.md" }));

	await waitFor(() => expect(view.transport.pendingCount("browseFile")).toBe(1));
	view.transport.resolve("browseFile", readyContent("raw-guide"));

	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("raw-guide"));
	expect(view.result.current.error).toContain("watch broke");
});

test("a raw read that fails after the watch failed reports its own failure", async () => {
	const view = renderReviewReading(base({ focusedPath: "docs/guide.md" }));
	view.ipc.rejectWatch(new Error("watch broke"));

	await waitFor(() => expect(view.transport.pendingCount("browseFile")).toBe(1));
	view.transport.reject("browseFile", new Error("raw read broke"));

	await waitFor(() => expect(view.result.current.fullFileError).toBeDefined());
	expect(view.result.current.fullFile).toBeUndefined();
});

test("a failed raw read reports the failure instead of leaving the file unread", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"]);

	view.rerender(base({ focusedPath: "docs/guide.md" }));
	await waitFor(() => expect(view.transport.pendingCount("browseFile")).toBe(1));
	view.transport.reject("browseFile", new Error("raw read broke"));

	await waitFor(() => expect(view.result.current.fullFileError).toBeDefined());
	expect(view.result.current.fullFile).toBeUndefined();
});

test("a raw refetch failure keeps the cached file instead of reporting it", async () => {
	const view = renderReviewReading(base({ focusedPath: "docs/guide.md" }));
	await settle(view, ["a", "b"]);
	await waitFor(() => expect(view.transport.pendingCount("browseFile")).toBe(1));
	view.transport.resolve("browseFile", readyContent("raw-guide"));
	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("raw-guide"));

	await rejectRefetch(
		view,
		"browseFile",
		new Error("refetch broke"),
		orpc.review.browseFile.key({
			type: "query",
			input: { projectId: "p1", worktree: "/p1", path: "docs/guide.md" },
		}),
	);

	expect(contentText(view.result.current.fullFile)).toBe("raw-guide");
	expect(view.result.current.fullFileError).toBeUndefined();
});

test("a focused file inside the diff never falls back to a raw read", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));
	await settle(view, ["a", "b"]);

	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	expect(view.transport.callsFor("browseFile")).toEqual([]);
});

test("a cold full-file error keeps the full file undefined and reports the failure", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));
	await settle(view, ["a", "b"]);
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.reject("fullFile", new Error("full file broke"));

	await waitFor(() => expect(view.result.current.fullFileError).toBeDefined());
	expect(view.result.current.fullFile).toBeUndefined();
});

test("a full-file refetch error keeps the cached full file", async () => {
	const view = renderReviewReading(base({ focusedPath: "a" }));
	await settle(view, ["a", "b"]);
	await waitFor(() => expect(view.transport.pendingCount("fullFile")).toBe(1));
	view.transport.resolve("fullFile", readyContent("full-a"));
	await waitFor(() => expect(contentText(view.result.current.fullFile)).toBe("full-a"));

	await rejectRefetch(
		view,
		"fullFile",
		new Error("refetch broke"),
		orpc.review.fullFile.key({
			type: "query",
			input: { projectId: "p1", worktree: "/p1", mode: "uncommitted", path: "a" },
		}),
	);

	expect(contentText(view.result.current.fullFile)).toBe("full-a");
});

test("the layout generation advances only on path-list or mode changes", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });
	const first = view.result.current.generation?.layoutGeneration;

	view.ipc.emitChange("p1", "/p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["a", "b"]));
	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));
	view.transport.resolve("files", filesResponse({ a: "a2", b: "b2" }), reading(["a", "b"]));
	await waitFor(() => expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a2"));
	expect(view.result.current.generation?.layoutGeneration).toBe(first);

	view.ipc.emitChange("p1", "/p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]));
	await waitFor(() => expect(view.transport.callsFor("files").some(reading(["a", "b", "c"]))).toBe(true));
	view.transport.resolve("files", filesResponse({ a: "a3", b: "b3", c: "c3" }), reading(["a", "b", "c"]));
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

test("a refresh that adds a file keeps the previous reading until the replacement completes", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });
	const complete = view.renders.length;

	view.ipc.emitChange("p1", "/p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["new", "a", "b"]));
	await waitFor(() => expect(view.transport.callsFor("files").some(reading(["new", "a", "b"]))).toBe(true));

	expect(view.result.current.generation?.snapshot.files.map((file) => file.path)).toEqual(["a", "b"]);
	expect(contentText(view.result.current.generation?.contentByPath?.get("a"))).toBe("a1");
	expect(view.result.current.refreshing).toBe(true);

	view.transport.resolve("files", filesResponse({ new: "n1", a: "a2", b: "b2" }), reading(["new", "a", "b"]));
	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(3));

	expect(view.result.current.generation?.snapshot.files.map((file) => file.path)).toEqual(["new", "a", "b"]);
	expect(view.result.current.refreshing).toBe(false);
	for (const reading of view.renders.slice(complete)) {
		expect(reading.generation?.contentByPath).toBeDefined();
	}
});

test("a cold reading reports no pending replacement", async () => {
	const view = renderReviewReading(base({}));
	await reachReady(view);
	view.transport.resolve("snapshot", snapshotOf(["a"]));
	await waitFor(() => expect(view.transport.pendingCount("files")).toBe(1));

	expect(view.result.current.generation?.contentByPath).toBeUndefined();

	view.transport.resolve("files", filesResponse({ a: "a1" }));
	await waitFor(() => expect(view.result.current.generation?.contentByPath?.size).toBe(1));

	expect(view.renders.some((reading) => reading.refreshing)).toBe(false);
});

test("switching scope reads again instead of publishing the retained scope", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.rerender(base({ mode: "branch" }));
	await waitFor(() =>
		expect(view.transport.callsFor("snapshot").some((input) => modeInput.assert(input).mode === "branch")).toBe(
			true,
		),
	);

	expect(view.result.current.generation?.contentByPath).toBeUndefined();
	expect(view.result.current.refreshing).toBe(false);
});

test("a failed replacement read completes the reading instead of retaining the previous one", async () => {
	const view = renderReviewReading(base({}));
	await settle(view, ["a", "b"], { a: "a1", b: "b1" });

	view.ipc.emitChange("p1", "/p1");
	await waitFor(() => expect(view.transport.pendingCount("snapshot")).toBe(1));
	view.transport.resolve("snapshot", snapshotOf(["a", "b", "c"]));
	await waitFor(() => expect(view.transport.callsFor("files").some(reading(["a", "b", "c"]))).toBe(true));
	view.transport.reject("files", new Error("batch broke"), reading(["a", "b", "c"]));

	await waitFor(() => expect(view.result.current.generation?.snapshot.files.length).toBe(3));

	expect(contentText(view.result.current.generation?.contentByPath?.get("c"))).toBe("unavailable");
	expect(view.result.current.refreshing).toBe(false);
});
