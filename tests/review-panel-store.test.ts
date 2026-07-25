import { expect, test } from "bun:test";
import { createReviewPanelStore } from "@renderer/routes/-utils/review-panel-store";

test("abandons the focused file when the scope changes", () => {
	const panel = createReviewPanelStore();
	panel.actions.focusFile("src/a.ts");

	panel.actions.selectMode("branch");

	expect(panel.state.mode).toBe("branch");
	expect(panel.state.focusedPath).toBeUndefined();
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
	panel.actions.toggleFile("src/a.ts");
	expect(panel.state.closedFiles.has("src/a.ts")).toBe(true);

	panel.actions.openFile("src/a.ts");
	const opened = panel.state.closedFiles;
	panel.actions.openFile("src/a.ts");

	expect(opened.has("src/a.ts")).toBe(false);
	expect(panel.state.closedFiles).toBe(opened);
});

test("closes every file in the scope and reopens them all", () => {
	const panel = createReviewPanelStore();
	const paths = ["src/a.ts", "src/b.ts"];

	panel.actions.closeScope(paths, true);
	expect([...panel.state.closedFiles]).toEqual(paths);

	panel.actions.closeScope(paths, false);
	expect(panel.state.closedFiles.size).toBe(0);
});

test("leaves the scope alone when it already reads as asked", () => {
	const panel = createReviewPanelStore();
	const closedFiles = panel.state.closedFiles;

	panel.actions.closeScope(["src/a.ts"], false);

	expect(panel.state.closedFiles).toBe(closedFiles);
});

test("keeps files closed outside the scope it was told to reopen", () => {
	const panel = createReviewPanelStore();
	panel.actions.closeScope(["src/a.ts", "src/b.ts"], true);

	panel.actions.closeScope(["src/a.ts"], false);

	expect([...panel.state.closedFiles]).toEqual(["src/b.ts"]);
});
