import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "@core/store/workspace";
import { SPLIT_RATIO_DEFAULT } from "@core/workspace/WorkspaceGroup";
import { WorkspacePersistence } from "@core/workspace/WorkspacePersistence";

describe("WorkspacePersistence", () => {
	it("persists the focused project, tabs, and selected Review", async () => {
		const session = { harness: "codex" as const, sessionId: "session" };
		await WorkspacePersistence.save({
			projects: [{ id: "one" }, { id: "two" }],
			groups: { two: { tabs: [{ id: "tab", split: false, splitRatio: SPLIT_RATIO_DEFAULT }], active: 0 } },
			activeIndex: 1,
			focus: "terminal",
			zen: { command: false, review: true },
			screen: "review",
			reviewSession: session,
			captures: { tab: { state: "bound", session } },
		});

		expect(await WorkspaceStore.read()).toEqual({
			projects: [{
				projectId: "two",
				tabs: [{ state: "bound", session, split: false, splitRatio: SPLIT_RATIO_DEFAULT }],
				activeTab: 0,
			}],
			focusedProjectId: "two",
			focus: "terminal",
			zen: { command: false, review: true },
			screen: "review",
			reviewSession: session,
		});
	});

	it("round-trips a Tab with the Split enabled and its ratio", async () => {
		await WorkspacePersistence.save({
			projects: [{ id: "one" }],
			groups: { one: { tabs: [{ id: "tab", split: true, splitRatio: 0.7 }], active: 0 } },
			activeIndex: 0,
			focus: "terminal",
			zen: { command: false, review: false },
			screen: "command",
			reviewSession: null,
			captures: {},
		});

		const workspace = await WorkspaceStore.read();
		expect(workspace.projects[0]?.tabs[0]).toEqual({ state: "empty", split: true, splitRatio: 0.7 });
	});

	it("normalizes an incomplete Review state to command mode", async () => {
		await WorkspacePersistence.save({
			projects: [],
			groups: {},
			activeIndex: 4,
			focus: "sidebar",
			zen: { command: false, review: false },
			screen: "review",
			reviewSession: null,
			captures: {},
		});

		const workspace = await WorkspaceStore.read();
		expect(workspace.screen).toBe("command");
		expect(workspace.reviewSession).toBeNull();
		expect(workspace.focusedProjectId).toBeNull();
	});
});
