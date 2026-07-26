import { expect, test } from "bun:test";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";
import { useShellTabs } from "@renderer/routes/-utils/use-shell-tabs";
import { act, renderHook } from "./testing-library";

function renderTabs() {
	const opened: ShellTab[] = [];
	const { result } = renderHook(() =>
		useShellTabs({
			projectId: "p1",
			restoredShells: [{ id: "s0", label: "Shell 0" }],
			restoredActiveShellId: "s0",
			onShellOpen: (_projectId, shell) => opened.push(shell),
			onShellClose: () => {},
			onShellSelect: () => {},
		})
	);

	return { result, opened };
}

test("a new shell carries no harness flag by default", () => {
	const { result, opened } = renderTabs();

	act(() => result.current.openTab(false));

	expect(opened.at(-1)?.plain).toBeUndefined();
});

test("a shell opened without a harness says so on the way to the store", () => {
	const { result, opened } = renderTabs();

	act(() => result.current.openTab(true));

	expect(opened.at(-1)?.plain).toBe(true);
	expect(result.current.activeTabId).toBe(opened.at(-1)?.id);
});
