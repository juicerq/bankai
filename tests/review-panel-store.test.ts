import { expect, test } from "bun:test";
import { createReviewPanelStore } from "@renderer/routes/-features/review/panel/review-panel-store";
import { DEFAULT_REVIEW_MODE } from "@renderer/routes/-features/review/header/review-scope";

test("opens on the working tree against HEAD", () => {
	expect(createReviewPanelStore().state.mode).toBe(DEFAULT_REVIEW_MODE);
	expect(DEFAULT_REVIEW_MODE).toBe("uncommitted");
});

test("keeps the focused file when the scope changes", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts");

	panel.actions.selectMode("branch");

	expect(panel.state.mode).toBe("branch");
	expect(panel.state.focusedPath).toBe("src/a.ts");
});

test("keeps the other view's focused file when the scope changes", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts");
	panel.actions.selectTreeView("browse");
	panel.actions.focusFile("docs/guide.md");

	panel.actions.selectMode("branch");
	panel.actions.selectTreeView("changes");

	expect(panel.state.focusedPath).toBe("src/a.ts");
});

test("focuses a file at a line and keeps the line with it", () => {
	const panel = createReviewPanelStore();

	panel.actions.focusFile("src/a.ts", 120);

	expect(panel.state.focusedPath).toBe("src/a.ts");
	expect(panel.state.focusedLine).toBe(120);
});

test("focusing another file without a line leaves no line behind", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts", 120);

	panel.actions.focusFile("src/b.ts");

	expect(panel.state.focusedPath).toBe("src/b.ts");
	expect(panel.state.focusedLine).toBeUndefined();
});

test("clearing the focus drops the line with the file", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts", 120);

	panel.actions.clearFocus();

	expect(panel.state.focusedPath).toBeUndefined();
	expect(panel.state.focusedLine).toBeUndefined();
});

test("each view remembers the line its focused file was left on", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts", 120);

	panel.actions.selectTreeView("browse");
	panel.actions.focusFile("docs/guide.md");

	expect(panel.state.focusedLine).toBeUndefined();

	panel.actions.selectTreeView("changes");

	expect(panel.state.focusedPath).toBe("src/a.ts");
	expect(panel.state.focusedLine).toBe(120);
});

test("abandons the focused line along with the file when another worktree is picked", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts", 120);

	panel.actions.pinWorktree("/tmp/feature");

	expect(panel.state.focusedLine).toBeUndefined();
});

test("abandons the focused file when another worktree is picked", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts");

	panel.actions.pinWorktree("/tmp/feature");

	expect(panel.state.pinnedWorktree).toBe("/tmp/feature");
	expect(panel.state.focusedPath).toBeUndefined();
});

test("follows the shell again once the pin is dropped", () => {
	const panel = createReviewPanelStore();
	panel.actions.pinWorktree("/tmp/feature");

	panel.actions.pinWorktree();

	expect(panel.state.pinnedWorktree).toBeUndefined();
});

test("opens a closed file and leaves an open one untouched", () => {
	const panel = createReviewPanelStore();
	panel.actions.setFileClosed("src/a.ts", true);
	expect(panel.state.fileClosedOverrides.get("src/a.ts")).toBe(true);

	panel.actions.openFile("src/a.ts");
	const opened = panel.state.fileClosedOverrides;
	panel.actions.openFile("src/a.ts");

	expect(opened.get("src/a.ts")).toBe(false);
	expect(panel.state.fileClosedOverrides).toBe(opened);
});

test("closes every file in the scope and reopens them all", () => {
	const panel = createReviewPanelStore();
	const paths = ["src/a.ts", "src/b.ts"];

	panel.actions.setFilesClosed(paths, true);
	expect([...panel.state.fileClosedOverrides]).toEqual(paths.map((path) => [path, true]));

	panel.actions.setFilesClosed(paths, false);
	expect([...panel.state.fileClosedOverrides]).toEqual(paths.map((path) => [path, false]));
});

test("leaves the scope alone when it already has the requested overrides", () => {
	const panel = createReviewPanelStore();
	panel.actions.setFilesClosed(["src/a.ts"], false);
	const overrides = panel.state.fileClosedOverrides;

	panel.actions.setFilesClosed(["src/a.ts"], false);

	expect(panel.state.fileClosedOverrides).toBe(overrides);
});

test("keeps files closed outside the scope it was told to reopen", () => {
	const panel = createReviewPanelStore();
	panel.actions.setFilesClosed(["src/a.ts", "src/b.ts"], true);

	panel.actions.setFilesClosed(["src/a.ts"], false);

	expect([...panel.state.fileClosedOverrides]).toEqual([
		["src/a.ts", false],
		["src/b.ts", true],
	]);
});

test("clears only the manual choices affected by a stored preference change", () => {
	const panel = createReviewPanelStore();
	panel.actions.setFilesClosed(["generated/a.ts", "src/b.ts"], true);

	panel.actions.clearFileOverrides(["generated/a.ts"]);

	expect([...panel.state.fileClosedOverrides]).toEqual([["src/b.ts", true]]);
});
