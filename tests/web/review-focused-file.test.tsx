import { afterEach, expect, mock, test } from "bun:test";
import type { FileChange, FullFile } from "@shared/review";
import * as reviewRows from "@renderer/routes/-features/review/reading/review-rows";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const measureWidth = reviewRows.diffContentWidth;
let widthCalls = 0;

void mock.module("@renderer/routes/-features/review/reading/review-rows", () => ({
	...reviewRows,
	diffContentWidth: (lines: Parameters<typeof measureWidth>[0]) => {
		widthCalls++;

		return measureWidth(lines);
	},
}));

const { ReviewFocusedFile, LEADING_CONTEXT } = await import("@renderer/routes/-features/review/reading/review-focused-file");
const { REVIEW_ROW_HEIGHT } = reviewRows;

afterEach(() => {
	widthCalls = 0;
	cleanup();
});

const file: FileChange = {
	path: "src/renderer.ts",
	status: "modified",
	additions: 1,
	deletions: 0,
};

const content: FullFile = {
	status: "ready",
	lines: [{ kind: "add", number: 1, hunk: 1, content: "ready" }],
};

const FOCUSABLE = "a[href], button, input, [tabindex]";

function clickInside(element: HTMLElement) {
	fireEvent.click(element);

	const owner = element.closest<HTMLElement>(FOCUSABLE);

	if (owner) {
		owner.focus();
		return;
	}

	if (document.activeElement instanceof HTMLElement) {
		document.activeElement.blur();
	}
}

function readerWidth() {
	return slot(get("review-focused-file"), "content").style.width;
}

function readerScroll() {
	return slot(get("review-focused-file"), "scroll").scrollTop;
}

function readingOf(lines: number, changedIndex?: number): FullFile {
	return {
		status: "ready",
		lines: Array.from({ length: lines }, (_, index) => ({
			kind: index === changedIndex ? ("add" as const) : ("context" as const),
			number: index + 1,
			hunk: 1,
			content: `line ${index + 1}`,
		})),
	};
}

function offsetOfIndex(index: number) {
	return (index - LEADING_CONTEXT) * REVIEW_ROW_HEIGHT.line;
}

function pressEscape() {
	fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

test("keeps the focused file body mounted through its first read", () => {
	const view = render(<ReviewFocusedFile path={file.path} change={file} onClose={() => {}} />);
	const body = slot(get("review-focused-file"), "body");

	expect(body.dataset.contentStatus).toBe("pending");

	view.rerender(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => {}} />);

	const readyBody = slot(get("review-focused-file"), "body");
	expect(readyBody).toBe(body);
	expect(readyBody.dataset.contentStatus).toBe("ready");
});

test("a failed read replaces the reading overlay with the failure", () => {
	render(<ReviewFocusedFile path="src/untouched.ts" error="read broke" onClose={() => {}} />);

	const body = slot(get("review-focused-file"), "body");

	expect(body.dataset.contentStatus).toBe("error");
	expect(body.textContent).toContain("read broke");
	expect(body.textContent).not.toContain("Reading file");
});

test("content that arrives keeps the failure off screen", () => {
	render(<ReviewFocusedFile path={file.path} change={file} content={content} error="read broke" onClose={() => {}} />);

	const body = slot(get("review-focused-file"), "body");

	expect(body.dataset.contentStatus).toBe("ready");
	expect(body.textContent).not.toContain("read broke");
});

test("shows an image returned for the focused file", () => {
	const image: FullFile = {
		status: "image",
		mime: "image/png",
		data: "iVBORw0KGgo=",
	};

	render(<ReviewFocusedFile path="assets/preview.png" content={image} onClose={() => {}} />);

	const body = slot(get("review-focused-file"), "body");
	const preview = get("review-focused-file-image");

	expect(body.dataset.contentStatus).toBe("image");
	expect(preview.dataset.mime).toBe("image/png");
	expect(slot(preview, "image").getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
});

test("keeps binary content as a notice instead of an image", () => {
	render(<ReviewFocusedFile path="assets/archive.bin" content={{ status: "binary" }} onClose={() => {}} />);

	expect(slot(get("review-focused-file"), "body").dataset.contentStatus).toBe("binary");
	expect(query("review-focused-file-image")).toBeNull();
});

test("closes on Escape after a click in the file text takes focus off the close button", () => {
	let closed = 0;

	render(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => closed++} />);
	clickInside(slot(get("review-focused-file"), "body"));
	pressEscape();

	expect(closed).toBe(1);
});

test("closes on Escape right after the reader opens, with no click before it", () => {
	let closed = 0;

	render(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => closed++} />);
	pressEscape();

	expect(closed).toBe(1);
});

test("measures the content width once for a file, however often the reader re-renders", () => {
	const view = render(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => {}} />);
	const width = readerWidth();

	view.rerender(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => {}} />);
	view.rerender(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => {}} />);

	expect(widthCalls).toBe(1);
	expect(readerWidth()).toBe(width);
	expect(width).toBe(`calc(${reviewRows.DIFF_GUTTER_WIDTH}px + 7ch)`);
});

test("measures again when the content changes", () => {
	const wider: FullFile = {
		status: "ready",
		lines: [{ kind: "add", number: 1, hunk: 1, content: "ready to read" }],
	};

	const view = render(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => {}} />);
	view.rerender(<ReviewFocusedFile path={file.path} change={file} content={wider} onClose={() => {}} />);

	expect(widthCalls).toBe(2);
	expect(readerWidth()).toBe(`calc(${reviewRows.DIFF_GUTTER_WIDTH}px + 15ch)`);
});

test("opens at the asked line, with the leading context above it", () => {
	render(<ReviewFocusedFile path={file.path} content={readingOf(40)} line={20} onClose={() => {}} />);

	expect(readerScroll()).toBe(offsetOfIndex(19));
});

test("without an asked line, opens at the first changed line", () => {
	render(<ReviewFocusedFile path={file.path} content={readingOf(40, 10)} onClose={() => {}} />);

	expect(readerScroll()).toBe(offsetOfIndex(10));
});

test("an asked line the file does not have falls back to the first changed line", () => {
	render(<ReviewFocusedFile path={file.path} content={readingOf(40, 10)} line={999} onClose={() => {}} />);

	expect(readerScroll()).toBe(offsetOfIndex(10));
});

test("reopening the same file at another line re-scrolls when the reader remounts", () => {
	const reading = readingOf(40);
	const view = render(
		<ReviewFocusedFile key={`${file.path}:8`} path={file.path} content={reading} line={8} onClose={() => {}} />,
	);

	expect(readerScroll()).toBe(offsetOfIndex(7));

	view.rerender(
		<ReviewFocusedFile key={`${file.path}:30`} path={file.path} content={reading} line={30} onClose={() => {}} />,
	);

	expect(readerScroll()).toBe(offsetOfIndex(29));
});

test("reads a file that has no change in the current diff", () => {
	const raw: FullFile = {
		status: "ready",
		lines: [{ kind: "context", number: 1, hunk: 0, content: "untouched" }],
	};

	render(<ReviewFocusedFile path="src/untouched.ts" content={raw} onClose={() => {}} />);

	const focused = get("review-focused-file");
	expect(focused.dataset.path).toBe("src/untouched.ts");
	expect(slot(focused, "body").dataset.contentStatus).toBe("ready");
});
