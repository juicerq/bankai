import { afterEach, expect, test } from "bun:test";
import type { FileChange, ReviewContent, ReviewMode, ReviewSnapshot } from "@main/git/contracts";
import { ReviewDiff, REVIEW_ROW_HEIGHT } from "@renderer/routes/-components/review-diff";
import { REVIEW_SCOPE_EMPTY } from "@renderer/routes/-utils/review-scope";
import type { ReviewReading } from "@renderer/routes/-utils/use-review-reading";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const LINES_PER_FILE = 40;
const FILE_HEIGHT = REVIEW_ROW_HEIGHT.file + LINES_PER_FILE * REVIEW_ROW_HEIGHT.line;

type Generation = NonNullable<ReviewReading["generation"]>;

function fileOf(path: string): FileChange {
	return { path, status: "modified", additions: LINES_PER_FILE, deletions: 0 };
}

function contentOf(path: string): ReviewContent {
	return {
		status: "ready",
		lines: Array.from({ length: LINES_PER_FILE }, (_, index) => ({
			kind: "add" as const,
			number: index + 1,
			hunk: 1,
			content: `${path}:${index + 1}`,
		})),
	};
}

function generationOf(layoutGeneration: number, paths: string[]): Generation {
	const files = paths.map(fileOf);

	return {
		layoutGeneration,
		snapshot: {
			state: "ready",
			files,
			totals: { additions: files.length * LINES_PER_FILE, deletions: 0, files: files.length },
		},
		contentByPath: new Map(paths.map((path) => [path, contentOf(path)])),
	};
}

function diffOf(generation: Generation, mode: ReviewMode = "uncommitted") {
	return (
		<ReviewDiff
			mode={mode}
			generation={generation}
			covered={false}
			closedFiles={new Set()}
			onToggleOpen={() => {}}
			onFocusFile={() => {}}
		/>
	);
}

function renderDiff(generation: Generation) {
	const view = render(diffOf(generation));
	const surface = () => {
		const node = view.container.querySelector("div");
		if (!node) {
			throw new Error("The diff surface is not rendered");
		}

		return node;
	};

	return {
		surface,
		read(scrollTop: number, scrollLeft = 0) {
			fireEvent.scroll(surface(), { target: { scrollTop, scrollLeft } });
		},
		replace(next: Generation) {
			view.rerender(diffOf(next));
		},
	};
}

test("a replacement reading paints at the line the reader was on", () => {
	const view = renderDiff(generationOf(1, ["a", "b"]));
	const line = REVIEW_ROW_HEIGHT.file + 23 * REVIEW_ROW_HEIGHT.line;

	view.read(line + 8, 120);
	view.replace(generationOf(2, ["new", "a", "b"]));

	expect(view.surface().scrollTop).toBe(FILE_HEIGHT + line + 8);
	expect(view.surface().scrollLeft).toBe(120);
});

test("a reading position whose file is gone falls back to the neighbouring file", () => {
	const view = renderDiff(generationOf(1, ["a", "b", "c"]));

	view.read(FILE_HEIGHT + REVIEW_ROW_HEIGHT.file + 4 * REVIEW_ROW_HEIGHT.line);
	view.replace(generationOf(2, ["a", "c"]));

	expect(view.surface().scrollTop).toBe(FILE_HEIGHT);
});

test("a replacement reading with nothing read yet paints at the top", () => {
	const view = renderDiff(generationOf(1, ["a", "b"]));

	view.replace(generationOf(2, ["new", "a", "b"]));

	expect(view.surface().scrollTop).toBe(0);
});

function noticeOf(state: ReviewSnapshot["state"], mode: ReviewMode) {
	const generation: Generation = {
		layoutGeneration: 1,
		snapshot: { state, files: [], totals: { additions: 0, deletions: 0, files: 0 } },
		contentByPath: new Map(),
	};

	render(diffOf(generation, mode));

	return get("review-notice");
}

test("an empty scope explains itself in that scope's own words", () => {
	expect(noticeOf("ready", "last-turn").textContent).toBe(REVIEW_SCOPE_EMPTY["last-turn"]);
	cleanup();

	expect(noticeOf("ready", "branch").textContent).toBe(REVIEW_SCOPE_EMPTY.branch);
});

test("a scope with no turn to read against says so instead of reading as empty", () => {
	expect(noticeOf("no-turn", "last-turn").dataset.reason).toBe("no-turn");
	cleanup();

	expect(noticeOf("ready", "last-turn").dataset.reason).toBe("empty");
});
