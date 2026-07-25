import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { ReviewMode } from "@main/git/contracts";
import { ReviewScope } from "@renderer/routes/-components/review-scope";
import { REVIEW_SCOPES } from "@renderer/routes/-utils/review-scope";
import { get, query } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function ReviewScopeHarness({ initial = "last-turn" }: { initial?: ReviewMode }) {
	const [mode, setMode] = useState<ReviewMode>(initial);

	return (
		<div data-component="scope-harness" data-mode={mode}>
			<ReviewScope mode={mode} onSelect={setMode} />
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

test("the trigger toggles its own menu", () => {
	render(<ReviewScopeHarness />);

	fireEvent.click(get("review-scope"));
	expect(query("review-scope-menu")).not.toBeNull();

	fireEvent.click(get("review-scope"));
	expect(query("review-scope-menu")).toBeNull();
});
