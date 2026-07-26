import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function WorkspaceShortcutHarness({ active = true }: { active?: boolean }) {
	const [reviewOpen, setReviewOpen] = useState(true);
	const registerShortcuts = useProjectWorkspaceShortcuts({
		active,
		onToggleReview: () => setReviewOpen((open) => !open),
	});

	return (
		<main
			ref={registerShortcuts}
			data-component="workspace-shortcut-state"
			data-review-open={reviewOpen}
		/>
	);
}

test("the leader followed by r toggles review without reaching the Shell", () => {
	render(<WorkspaceShortcutHarness />);

	const leaderPassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const reviewPassedThrough = fireEvent.keyDown(window, { key: "r", code: "KeyR" });

	expect(leaderPassedThrough).toBe(false);
	expect(reviewPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("false");

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.keyDown(window, { key: "r", code: "KeyR" });
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("true");
});

test("r on its own reaches the Shell instead of toggling review", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "r", code: "KeyR" });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("true");
});

test("the digit binding no longer belongs to the workspace", () => {
	render(<WorkspaceShortcutHarness />);

	const digitPassedThrough = fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true });

	expect(digitPassedThrough).toBe(true);
});

test("new shell and close shell no longer belong to the workspace", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const newPassedThrough = fireEvent.keyDown(window, { key: "t", code: "KeyT" });

	expect(newPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("true");
});

test("window blur disarms a pending review shortcut", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.blur(window);
	const reviewPassedThrough = fireEvent.keyDown(window, { key: "r", code: "KeyR" });

	expect(reviewPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("true");
});

test("inactive workspaces leave review shortcuts alone", () => {
	render(<WorkspaceShortcutHarness active={false} />);

	const leaderPassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const reviewPassedThrough = fireEvent.keyDown(window, { key: "r", code: "KeyR" });

	expect(leaderPassedThrough).toBe(true);
	expect(reviewPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("true");
});
