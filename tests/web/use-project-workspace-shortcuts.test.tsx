import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-features/workspace/surface/use-project-workspace-shortcuts";
import { get } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

afterEach(() => {
	cleanup();
	delete window.bankaiSessionPage;
});

function WorkspaceShortcutHarness({ active = true }: { active?: boolean }) {
	const [reviewOpen, setReviewOpen] = useState(true);
	const [reviewExpanded, setReviewExpanded] = useState(false);
	const [commandsOpen, setCommandsOpen] = useState(false);
	const [quickOpen, setQuickOpen] = useState(false);
	const [pageOpen, setPageOpen] = useState(false);
	const registerShortcuts = useProjectWorkspaceShortcuts({
		active,
		onToggleReview: () => setReviewOpen((open) => !open),
		onToggleReviewExpanded: () => setReviewExpanded((expanded) => !expanded),
		onTogglePage: () => setPageOpen((open) => !open),
		onOpenCommands: () => setCommandsOpen(true),
		onOpenQuickOpen: () => setQuickOpen(true),
	});

	return (
		<main
			ref={registerShortcuts}
			data-component="workspace-shortcut-state"
			data-review-open={reviewOpen}
			data-review-expanded={reviewExpanded}
			data-commands-open={commandsOpen}
			data-quick-open={quickOpen}
			data-page-open={pageOpen}
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

test("the leader followed by e expands the review panel", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const expandPassedThrough = fireEvent.keyDown(window, { key: "e", code: "KeyE" });

	expect(expandPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.reviewExpanded).toBe("true");
});

test("the leader followed by g toggles the session page", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const pagePassedThrough = fireEvent.keyDown(window, { key: "g", code: "KeyG" });

	expect(pagePassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.pageOpen).toBe("true");

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.keyDown(window, { key: "g", code: "KeyG" });
	expect(get("workspace-shortcut-state").dataset.pageOpen).toBe("false");
});

test("g on its own reaches the Shell instead of toggling the session page", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "g", code: "KeyG" });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.pageOpen).toBe("false");
});

test("the leader followed by c opens the commands palette", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const commandsPassedThrough = fireEvent.keyDown(window, { key: "c", code: "KeyC" });

	expect(commandsPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.commandsOpen).toBe("true");
});

test("the leader followed by p opens quick open", () => {
	render(<WorkspaceShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const pickerPassedThrough = fireEvent.keyDown(window, { key: "p", code: "KeyP" });

	expect(pickerPassedThrough).toBe(false);
	expect(get("workspace-shortcut-state").dataset.quickOpen).toBe("true");
});

test("p on its own reaches the Shell instead of opening quick open", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.quickOpen).toBe("false");
});

test("c on its own reaches the Shell instead of opening commands", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "c", code: "KeyC" });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.commandsOpen).toBe("false");
});

test("e on its own reaches the Shell instead of expanding review", () => {
	render(<WorkspaceShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "e", code: "KeyE" });

	expect(typedPassedThrough).toBe(true);
	expect(get("workspace-shortcut-state").dataset.reviewExpanded).toBe("false");
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

test("semantic shortcuts from a focused Page keep workspace controls working", () => {
	let relay: Parameters<NonNullable<typeof window.bankaiSessionPage>["onShortcut"]>[0] | undefined;
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		onState: () => () => {},
		onShortcut: (listener) => {
			relay = listener;
			return () => {};
		},
	};
	render(<WorkspaceShortcutHarness />);

	act(() => {
		relay?.({ action: "toggle-review" });
		relay?.({ action: "toggle-expanded" });
		relay?.({ action: "open-commands" });
		relay?.({ action: "open-quick-open" });
		relay?.({ action: "toggle-page" });
	});

	expect(get("workspace-shortcut-state").dataset.reviewOpen).toBe("false");
	expect(get("workspace-shortcut-state").dataset.reviewExpanded).toBe("true");
	expect(get("workspace-shortcut-state").dataset.commandsOpen).toBe("true");
	expect(get("workspace-shortcut-state").dataset.quickOpen).toBe("true");
	expect(get("workspace-shortcut-state").dataset.pageOpen).toBe("true");
});
