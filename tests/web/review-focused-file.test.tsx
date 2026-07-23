import { afterEach, expect, test } from "bun:test";
import type { FileChange, FullFile } from "@main/git/contracts";
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
	const view = render(<ReviewFocusedFile file={file} onClose={() => {}} />);
	const body = slot(get("review-focused-file"), "body");

	expect(body.dataset.contentStatus).toBe("pending");

	view.rerender(<ReviewFocusedFile file={file} content={content} onClose={() => {}} />);

	const readyBody = slot(get("review-focused-file"), "body");
	expect(readyBody).toBe(body);
	expect(readyBody.dataset.contentStatus).toBe("ready");
});
