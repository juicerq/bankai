import { expect, test } from "bun:test";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";
import { useShellTabs } from "@renderer/routes/-utils/use-shell-tabs";
import { act, renderHook } from "./testing-library";

function renderTabs(selectedShellId?: string) {
	const opened: ShellTab[] = [];
	const selected: string[] = [];
	const { result, rerender } = renderHook(
		({ selection }: { selection: string | undefined }) =>
			useShellTabs({
				projectId: "p1",
				restoredShells: [{ id: "s0", label: "Shell 0" }],
				selectedShellId: selection,
				onShellOpen: (_projectId, shell) => opened.push(shell),
				onShellClose: () => {},
				onShellSelect: (_projectId, shellId) => selected.push(shellId),
			}),
		{ initialProps: { selection: selectedShellId } },
	);

	return { result, rerender, opened, selected };
}

test("a new shell carries no harness flag by default", () => {
	const { result, opened } = renderTabs("s0");

	act(() => result.current.openTab(false));

	expect(opened.at(-1)?.plain).toBeUndefined();
});

test("a shell opened without a harness says so on the way to the store", () => {
	const { result, opened } = renderTabs("s0");

	act(() => result.current.openTab(true));

	expect(opened.at(-1)?.plain).toBe(true);
});

test("the active tab is the selected session once the store names it", () => {
	const { result, rerender, opened } = renderTabs("s0");

	act(() => result.current.openTab(false));
	expect(result.current.activeTabId).toBe("s0");

	rerender({ selection: opened.at(-1)?.id });

	expect(result.current.activeTabId).toBe(opened.at(-1)?.id);
});

test("a selection belonging to another project leaves this workspace on its first tab", () => {
	const { result } = renderTabs("elsewhere");

	expect(result.current.activeTabId).toBe("s0");
});

test("selecting a tab asks the store instead of deciding on its own", () => {
	const { result, selected } = renderTabs("s0");

	act(() => result.current.openTab(false));
	act(() => result.current.selectTab(result.current.tabs[1]?.id ?? ""));

	expect(selected).toEqual([result.current.tabs[1]?.id ?? ""]);
	expect(result.current.activeTabId).toBe("s0");
});

test("closing a tab drops it from the list", () => {
	const { result } = renderTabs("s0");

	act(() => result.current.openTab(false));
	act(() => result.current.closeTab("s0"));

	expect(result.current.tabs.map((tab) => tab.label)).toEqual(["Shell 1"]);
});
