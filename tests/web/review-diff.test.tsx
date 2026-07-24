import { afterEach, expect, test } from "bun:test";
import type { FileChange, ReviewContent } from "@main/git/contracts";
import { ReviewDiff, REVIEW_ROW_HEIGHT } from "@renderer/routes/-components/review-diff";
import type { ReviewReading } from "@renderer/routes/-utils/use-review-reading";
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
			isRepo: true,
			files,
			totals: { additions: files.length * LINES_PER_FILE, deletions: 0, files: files.length },
		},
		contentByPath: new Map(paths.map((path) => [path, contentOf(path)])),
	};
}

function diffOf(generation: Generation) {
	return (
		<ReviewDiff
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
