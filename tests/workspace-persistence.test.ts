import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "@core/store/workspace";
import { WorkspacePersistence } from "@core/workspace/WorkspacePersistence";

describe("WorkspacePersistence", () => {
	it("persists the focused project, tabs, and selected Review", async () => {
		const session = { harness: "codex" as const, sessionId: "session" };
		await WorkspacePersistence.save({
			projects: [{ id: "one" }, { id: "two" }],
			groups: { two: { tabs: ["tab"], active: 0 } },
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
				tabs: [{ state: "bound", session }],
				activeTab: 0,
			}],
			focusedProjectId: "two",
			focus: "terminal",
			zen: { command: false, review: true },
			screen: "review",
			reviewSession: session,
		});
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
