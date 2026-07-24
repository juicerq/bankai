import "./register-dom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ActivityChangedEvent, AgentActivityState, BankaiActivityApi } from "@shared/activity";
import { ProjectWorkspaceShellTabs } from "@renderer/routes/-components/project-workspace";
import { useAgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import { get } from "./dom";
import { act, cleanup, render, renderHook } from "./testing-library";

let listener: ((event: ActivityChangedEvent) => void) | undefined;

function emit(event: ActivityChangedEvent) {
	act(() => listener?.(event));
}

beforeEach(() => {
	listener = undefined;
	const api: BankaiActivityApi = {
		watch: async () => ({ state: null, shells: {} }),
		unwatch() {},
		onChanged: (next) => {
			listener = next;
			return () => {
				listener = undefined;
			};
		},
		markViewed() {},
	};
	window.bankaiActivity = api;
});

afterEach(() => {
	cleanup();
});

const tabs = [
	{ id: "t1", label: "Shell 1" },
	{ id: "t2", label: "Shell 2" },
];

function renderTabs(shellActivity: ReadonlyMap<string, AgentActivityState>) {
	return render(
		<ProjectWorkspaceShellTabs
			tabs={tabs}
			activeTabId="t1"
			shellActivity={shellActivity}
			sessionIds={{ t1: "s1", t2: "s2" }}
			onSelect={() => {}}
			onClose={() => {}}
			onMove={() => {}}
			onNew={() => {}}
		/>,
	);
}

describe("shell tab activity dot", () => {
	test("marks a tab with its own shell's state and leaves quiet tabs unmarked", () => {
		renderTabs(new Map([["s1", "working"]]));

		expect(get("shell-tab", { tabId: "t1" }).dataset.activity).toBe("working");
		expect(get("shell-tab", { tabId: "t2" }).dataset.activity).toBeUndefined();
	});

	test("clears the tab dot when its shell state drops", () => {
		const { rerender } = renderTabs(new Map([["s1", "done-unseen"]]));
		expect(get("shell-tab", { tabId: "t1" }).dataset.activity).toBe("done-unseen");

		rerender(
			<ProjectWorkspaceShellTabs
				tabs={tabs}
				activeTabId="t1"
				shellActivity={new Map()}
				sessionIds={{ t1: "s1", t2: "s2" }}
				onSelect={() => {}}
				onClose={() => {}}
				onMove={() => {}}
				onNew={() => {}}
			/>,
		);

		expect(get("shell-tab", { tabId: "t1" }).dataset.activity).toBeUndefined();
	});
});

describe("useAgentActivities shells", () => {
	test("exposes per-shell state for a project and clears a viewed shell", async () => {
		const { result } = renderHook(() => useAgentActivities(["p1"]));
		await act(async () => {});

		emit({ projectId: "p1", state: "done-unseen", shells: { s1: "working", s2: "done-unseen" } });
		expect(result.current.shells.get("s1")).toBe("working");
		expect(result.current.shells.get("s2")).toBe("done-unseen");
		expect(result.current.projects.get("p1")).toBe("done-unseen");

		emit({ projectId: "p1", state: "working", shells: { s1: "working" } });
		expect(result.current.shells.get("s1")).toBe("working");
		expect(result.current.shells.has("s2")).toBe(false);
		expect(result.current.projects.get("p1")).toBe("working");
	});
});
