import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { ReviewMode } from "@main/git/git-contracts";
import { ReviewScope } from "@renderer/routes/-components/review-scope";
import { REVIEW_SCOPES, sharedWorktreeNotice } from "@renderer/routes/-utils/review-scope";
import { get, query } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function ReviewScopeHarness({ initial = "last-turn", sharedWith = [] }: {
	initial?: ReviewMode;
	sharedWith?: string[];
}) {
	const [mode, setMode] = useState<ReviewMode>(initial);

	return (
		<div data-component="scope-harness" data-mode={mode}>
			<ReviewScope mode={mode} sharedWith={sharedWith} onSelect={setMode} />
		</div>
	);
}

function menuItem(label: string) {
	const items = [...get("review-scope-menu").querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
	const match = items.find((item) => item.textContent?.startsWith(label));
	if (!match) {
		throw new Error(`No scope menu item for ${label}`);
	}

	return match;
}

test("the header names the scope being read", () => {
	render(<ReviewScopeHarness />);

	expect(get("review-scope").textContent).toBe(REVIEW_SCOPES["last-turn"].label);
});

test("the menu offers every scope and marks the current one", () => {
	render(<ReviewScopeHarness />);

	fireEvent.click(get("review-scope"));

	expect(menuItem(REVIEW_SCOPES["last-turn"].label).getAttribute("aria-checked")).toBe("true");
	expect(menuItem(REVIEW_SCOPES.uncommitted.label).getAttribute("aria-checked")).toBe("false");
	expect(menuItem(REVIEW_SCOPES.branch.label).getAttribute("aria-checked")).toBe("false");
});

test("choosing a scope reads it and closes the menu", () => {
	render(<ReviewScopeHarness />);

	fireEvent.click(get("review-scope"));
	fireEvent.click(menuItem(REVIEW_SCOPES.branch.label));

	expect(get("scope-harness").dataset.mode).toBe("branch");
	expect(query("review-scope-menu")).toBeNull();
});

test("a worktree another agent writes in is marked, naming who else is there", () => {
	render(<ReviewScopeHarness sharedWith={["Shell 1"]} />);

	expect(get("review-scope-shared").title).toBe(sharedWorktreeNotice(["Shell 1"]));
});

test("the mark stays quiet while the shell owns its worktree", () => {
	render(<ReviewScopeHarness />);

	expect(query("review-scope-shared")).toBeNull();
});

test("scopes that already read the whole worktree carry no mark", () => {
	render(<ReviewScopeHarness initial="uncommitted" sharedWith={["Shell 1"]} />);

	expect(query("review-scope-shared")).toBeNull();
});

test("the trigger toggles its own menu", () => {
	render(<ReviewScopeHarness />);

	fireEvent.click(get("review-scope"));
	expect(query("review-scope-menu")).not.toBeNull();

	fireEvent.click(get("review-scope"));
	expect(query("review-scope-menu")).toBeNull();
});
