import { afterEach, expect, test } from "bun:test";
import type { FileChange, FullFile } from "@main/git/git-contracts";
import { ReviewFocusedFile } from "@renderer/routes/-components/review-focused-file";
import { get, slot } from "./dom";
import { cleanup, render } from "./testing-library";

afterEach(cleanup);

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

test("keeps the focused file body mounted through its first read", () => {
	const view = render(<ReviewFocusedFile path={file.path} change={file} onClose={() => {}} />);
	const body = slot(get("review-focused-file"), "body");

	expect(body.dataset.contentStatus).toBe("pending");

	view.rerender(<ReviewFocusedFile path={file.path} change={file} content={content} onClose={() => {}} />);

	const readyBody = slot(get("review-focused-file"), "body");
	expect(readyBody).toBe(body);
	expect(readyBody.dataset.contentStatus).toBe("ready");
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
