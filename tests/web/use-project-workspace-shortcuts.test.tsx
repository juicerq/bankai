import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function WorkspaceShortcutHarness({ active = true }: { active?: boolean }) {
	const [reviewOpen, setReviewOpen] = useState(true);
	const [activeTabId, setActiveTabId] = useState("shell-1");
	const tabs = [{ id: "shell-1" }, { id: "shell-2" }];
	const registerShortcuts = useProjectWorkspaceShortcuts({
		active,
		tabs,
		onActivateTab: setActiveTabId,
		onToggleReview: () => setReviewOpen((open) => !open),
	});

	return (
		<main
			ref={registerShortcuts}
			data-component="workspace-shortcut-state"
			data-review-open={reviewOpen}
			data-active-tab-id={activeTabId}
		/>
	);
}

test("review and tab shortcuts toggle the active workspace without reaching the Shell", () => {
	render(<WorkspaceShortcutHarness />);

	const leaderPassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const reviewPassedThrough = fireEvent.keyDown(window, { key: "r", code: "KeyR" });

	expect(leaderPassedThrough).toBe(false);
	expect(reviewPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("false");

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.keyDown(window, { key: "r", code: "KeyR" });
	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("true");

	const tabPassedThrough = fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true });
	expect(tabPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.activeTabId).toBe("shell-2");
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
