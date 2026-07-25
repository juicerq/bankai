import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function WorkspaceShortcutHarness({ active = true }: { active?: boolean }) {
	const [reviewOpen, setReviewOpen] = useState(true);
	const [tabs, setTabs] = useState([{ id: "shell-1" }, { id: "shell-2" }]);
	const [activeTabId, setActiveTabId] = useState<string | undefined>("shell-1");
	const registerShortcuts = useProjectWorkspaceShortcuts({
		active,
		tabs,
		activeTabId,
		onActivateTab: setActiveTabId,
		onCloseTab: (tabId) => {
			setTabs((current) => current.filter((tab) => tab.id !== tabId));
			setActiveTabId((current) => (current === tabId ? undefined : current));
		},
		onNewTab: () => {
			const opened = { id: `shell-${tabs.length + 1}` };
			setTabs([...tabs, opened]);
			setActiveTabId(opened.id);
		},
		onToggleReview: () => setReviewOpen((open) => !open),
	});

	return (
		<main
			ref={registerShortcuts}
			data-component="workspace-shortcut-state"
			data-review-open={reviewOpen}
			data-active-tab-id={activeTabId}
			data-tab-ids={tabs.map((tab) => tab.id).join(",")}
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

test("the leader followed by x closes the shell the user is on", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const closePassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX" });

	expect(closePassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.tabIds).toBe("shell-2");
	expect(get("workspace-shortcut-state").dataset.activeTabId).toBeUndefined();
});

test("the leader followed by t opens a shell and moves the user onto it", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const newPassedThrough = fireEvent.keyDown(window, { key: "t", code: "KeyT" });

	expect(newPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.tabIds).toBe("shell-1,shell-2,shell-3");
	expect(get("workspace-shortcut-state").dataset.activeTabId).toBe("shell-3");
});

test("t on its own reaches the Shell instead of opening one", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "t", code: "KeyT" });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.tabIds).toBe("shell-1,shell-2");
});

test("x on its own reaches the Shell instead of closing it", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX" });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.tabIds).toBe("shell-1,shell-2");
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
