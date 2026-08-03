import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { Worktree } from "@main/git/git-contracts";
import type { AgentActivityState } from "@shared/activity";
import { ReviewWorktree } from "@renderer/routes/-components/review-worktree";
import { resolveReviewWorktree } from "@renderer/routes/-utils/review-worktree";
import { get, query } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const PROJECT = "/home/jui/projects/bankai";
const SOLO = "/tmp/bankai-worktrees";

const WORKTREES: Worktree[] = [
	{ path: PROJECT, branch: "main" },
	{ path: SOLO, branch: "feat/worktrees" },
];

function ReviewWorktreeHarness({
	shellPath,
	worktrees = WORKTREES,
	activity = new Map(),
	removeFailure,
	onRemove = () => {},
}: {
	shellPath?: string;
	worktrees?: Worktree[];
	activity?: ReadonlyMap<string, AgentActivityState>;
	removeFailure?: { path: string; message: string };
	onRemove?: (path: string) => void;
}) {
	const [pinned, setPinned] = useState<string>();
	const activePath = resolveReviewWorktree({ pinned, shellWorktree: shellPath, worktrees }) ?? PROJECT;

	return (
		<div data-component="worktree-harness" data-active={activePath}>
			<ReviewWorktree
				worktrees={worktrees}
				activePath={activePath}
				mainPath={PROJECT}
				pinnedPath={pinned}
				shellPath={shellPath}
				activity={activity}
				removeFailure={removeFailure}
				onSelect={setPinned}
				onRemove={onRemove}
			/>
		</div>
	);
}

function signal(label: string) {
	const dot = menuItem(label).parentElement?.querySelector<HTMLElement>('[data-slot="signal"]');

	return dot ?? undefined;
}

function queryRemoveButton(label: string) {
	return menuItem(label).parentElement?.querySelector<HTMLElement>('[data-slot="remove"]') ?? null;
}

function removeButton(label: string) {
	const button = queryRemoveButton(label);
	if (!button) {
		throw new Error(`No remove button for ${label}`);
	}

	return button;
}

function menuItem(label: string) {
	const items = [...get("review-worktree-menu").querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
	const match = items.find((item) => item.textContent?.startsWith(label));
	if (!match) {
		throw new Error(`No worktree menu item for ${label}`);
	}

	return match;
}

test("a project with no extra worktrees still names the checkout being read", () => {
	render(<ReviewWorktreeHarness worktrees={[{ path: PROJECT, branch: "main" }]} />);

	expect(get("review-worktree").textContent).toBe("main");

	fireEvent.click(get("review-worktree"));

	expect(menuItem("main").textContent).toContain(`root · ${PROJECT}`);
	expect(get("review-worktree-menu").textContent).toContain("No agent worktree yet");
});

test("a listing that has not arrived yet falls back to the checkout's folder", () => {
	render(<ReviewWorktreeHarness worktrees={[]} />);

	expect(get("review-worktree").textContent).toBe("bankai");
	expect(get("review-worktree").getAttribute("title")).toBe(PROJECT);
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

test("the menu signals each worktree with its agent's state", () => {
	render(<ReviewWorktreeHarness activity={new Map([[SOLO, "working"]])} />);

	fireEvent.click(get("review-worktree"));

	expect(signal("feat/worktrees")?.title).toBe("working");
	expect(signal("main")).toBeUndefined();
});

test("a worktree whose agent waits is not signalled as working", () => {
	render(<ReviewWorktreeHarness activity={new Map([[SOLO, "needs-attention"]])} />);

	fireEvent.click(get("review-worktree"));

	expect(signal("feat/worktrees")?.title).toBe("needs-attention");
});

test("the project's own checkout is named in its path instead of a badge", () => {
	render(<ReviewWorktreeHarness />);

	fireEvent.click(get("review-worktree"));

	expect(menuItem("main").textContent).toContain(`root · ${PROJECT}`);
	expect(menuItem("feat/worktrees").textContent).not.toContain("root");
});

test("the first click on the remove icon only arms the confirmation", () => {
	let removed: string[] = [];
	render(<ReviewWorktreeHarness onRemove={(path) => removed.push(path)} />);

	fireEvent.click(get("review-worktree"));
	fireEvent.click(removeButton("feat/worktrees"));

	expect(removed).toEqual([]);
	expect(removeButton("feat/worktrees").getAttribute("aria-label")).toBe(
		"Confirm: Remove worktree feat/worktrees",
	);
});

test("clicking the armed confirmation removes the worktree", () => {
	let removed: string[] = [];
	render(<ReviewWorktreeHarness onRemove={(path) => removed.push(path)} />);

	fireEvent.click(get("review-worktree"));
	fireEvent.click(removeButton("feat/worktrees"));
	fireEvent.click(removeButton("feat/worktrees"));

	expect(removed).toEqual([SOLO]);
	expect(query("review-worktree-menu")).not.toBeNull();
});

test("the confirmation disarms itself when it is left alone", async () => {
	render(<ReviewWorktreeHarness />);

	fireEvent.click(get("review-worktree"));
	fireEvent.click(removeButton("feat/worktrees"));

	await waitFor(
		() => expect(removeButton("feat/worktrees").getAttribute("aria-label")).toBe("Remove worktree feat/worktrees"),
		{ timeout: 3000 },
	);
});

test("following the shell stays out of the scrolling list", () => {
	render(<ReviewWorktreeHarness />);

	fireEvent.click(get("review-worktree"));

	const pinned = get("review-worktree-menu").querySelector('[data-slot="pinned"]');
	expect(pinned?.textContent).toContain("Follow shell");
	expect(pinned?.contains(menuItem("main"))).toBe(false);
});

test("the main worktree of the project offers no removal", () => {
	render(<ReviewWorktreeHarness />);

	fireEvent.click(get("review-worktree"));

	expect(queryRemoveButton("main")).toBeNull();
});

test("a refused removal is reported on the worktree it failed for", () => {
	render(
		<ReviewWorktreeHarness
			removeFailure={{ path: SOLO, message: "contains modified or untracked files" }}
		/>,
	);

	fireEvent.click(get("review-worktree"));

	expect(menuItem("feat/worktrees").textContent).toContain("contains modified or untracked files");
	expect(menuItem("main").textContent).toContain(PROJECT);
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
