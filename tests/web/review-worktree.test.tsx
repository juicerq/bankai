import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { Worktree } from "@main/git/contracts";
import { ReviewWorktree } from "@renderer/routes/-components/review-worktree";
import { resolveReviewWorktree } from "@renderer/routes/-utils/review-worktree";
import { get, query } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const PROJECT = "/home/jui/projects/bankai-2";
const SOLO = "/tmp/bankai-2-worktrees";

const WORKTREES: Worktree[] = [
	{ path: PROJECT, branch: "main" },
	{ path: SOLO, branch: "feat/worktrees" },
];

function ReviewWorktreeHarness({ shellPath, worktrees = WORKTREES }: { shellPath?: string; worktrees?: Worktree[] }) {
	const [pinned, setPinned] = useState<string>();
	const activePath = resolveReviewWorktree({ pinned, shellWorktree: shellPath, worktrees }) ?? PROJECT;

	return (
		<div data-component="worktree-harness" data-active={activePath}>
			<ReviewWorktree
				worktrees={worktrees}
				activePath={activePath}
				pinnedPath={pinned}
				shellPath={shellPath}
				onSelect={setPinned}
			/>
		</div>
	);
}

function menuItem(label: string) {
	const items = [...get("review-worktree-menu").querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
	const match = items.find((item) => item.textContent?.startsWith(label));
	if (!match) {
		throw new Error(`No worktree menu item for ${label}`);
	}

	return match;
}

test("a project with a single worktree shows no selector", () => {
	render(<ReviewWorktreeHarness worktrees={[{ path: PROJECT, branch: "main" }]} />);

	expect(query("review-worktree")).toBeNull();
});

test("the review follows the shell's agent into its worktree", () => {
	render(<ReviewWorktreeHarness shellPath={SOLO} />);

	expect(get("worktree-harness").dataset.active).toBe(SOLO);
	expect(get("review-worktree").textContent).toBe("feat/worktrees");
});

test("without an agent worktree the review reads the project itself", () => {
	render(<ReviewWorktreeHarness />);

	expect(get("worktree-harness").dataset.active).toBe(PROJECT);
	expect(get("review-worktree").textContent).toBe("main");
});

test("pinning a worktree overrides the shell", () => {
	render(<ReviewWorktreeHarness shellPath={SOLO} />);

	fireEvent.click(get("review-worktree"));
	fireEvent.click(menuItem("main"));

	expect(get("worktree-harness").dataset.active).toBe(PROJECT);
	expect(query("review-worktree-menu")).toBeNull();
});

test("following the shell again releases the pin", () => {
	render(<ReviewWorktreeHarness shellPath={SOLO} />);

	fireEvent.click(get("review-worktree"));
	fireEvent.click(menuItem("main"));
	fireEvent.click(get("review-worktree"));
	fireEvent.click(menuItem("Follow shell"));

	expect(get("worktree-harness").dataset.active).toBe(SOLO);
});

test("the menu marks where the shell's agent works", () => {
	render(<ReviewWorktreeHarness shellPath={SOLO} />);

	fireEvent.click(get("review-worktree"));

	expect(menuItem("feat/worktrees").querySelector('[data-slot="live"]')).not.toBeNull();
	expect(menuItem("main").querySelector('[data-slot="live"]')).toBeNull();
});

test("a pin surviving a removed worktree falls back to the shell", () => {
	expect(resolveReviewWorktree({ pinned: "/tmp/gone", shellWorktree: SOLO, worktrees: WORKTREES })).toBe(SOLO);
});

test("an unlisted shell worktree is not read", () => {
	expect(resolveReviewWorktree({ shellWorktree: "/tmp/gone", worktrees: WORKTREES })).toBeUndefined();
});

test("a listing that has not arrived yet still follows the shell", () => {
	expect(resolveReviewWorktree({ shellWorktree: SOLO, worktrees: [] })).toBe(SOLO);
});
