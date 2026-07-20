import { describe, expect, it } from "vitest";
import type { Workspace } from "@core/store/workspace";
import { SPLIT_RATIO_DEFAULT } from "@core/workspace/WorkspaceGroup";
import { planRestore } from "@core/workspace/planRestore";

const claude = { harness: "claude" as const, sessionId: "s1" };

type WorkspaceBase = Omit<Workspace, "screen" | "reviewSession">;

function workspace(overrides: Partial<WorkspaceBase>): Workspace {
	return {
		projects: [],
		focusedProjectId: null,
		focus: "sidebar",
		zen: { command: false, review: false },
		screen: "command",
		reviewSession: null,
		...overrides,
	};
}

function reviewWorkspace(overrides: Partial<WorkspaceBase>): Workspace {
	return {
		...workspace(overrides),
		screen: "review",
		reviewSession: claude,
	};
}

describe("planRestore", () => {
	it("restores only captured running Sessions", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [{
					projectId: "p",
					tabs: [
						{ state: "bound", session: claude },
						{ state: "bound", session: claude, running: { argv: ["claude"] } },
					],
					activeTab: 9,
				}],
			}),
			projects: [{ id: "p" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(["claude:s1"]),
		});
		expect(plan.projects[0]?.tabs).toEqual([
			{ split: false, splitRatio: SPLIT_RATIO_DEFAULT },
			{
				split: false,
				splitRatio: SPLIT_RATIO_DEFAULT,
				runningSession: { session: claude, argv: ["claude"] },
				resumable: true,
			},
		]);
		expect(plan.projects[0]?.activeTab).toBe(1);
	});

	it("restores the persisted Split flag per Tab, defaulting older tabs to off", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [{
					projectId: "p",
					tabs: [
						{ state: "empty", split: true },
						{ state: "empty" },
					],
					activeTab: 0,
				}],
			}),
			projects: [{ id: "p" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});
		expect(plan.projects[0]?.tabs).toEqual([
			{ split: true, splitRatio: SPLIT_RATIO_DEFAULT },
			{ split: false, splitRatio: SPLIT_RATIO_DEFAULT },
		]);
	});

	it("restores the persisted split ratio per Tab, defaulting older tabs", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [{
					projectId: "p",
					tabs: [
						{ state: "empty", splitRatio: 0.7 },
						{ state: "empty" },
					],
					activeTab: 0,
				}],
			}),
			projects: [{ id: "p" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});
		expect(plan.projects[0]?.tabs).toEqual([
			{ split: false, splitRatio: 0.7 },
			{ split: false, splitRatio: SPLIT_RATIO_DEFAULT },
		]);
	});

	it("restores a selected Review independently", () => {
		const plan = planRestore({
			workspace: reviewWorkspace({}),
			projects: [],
			reviewTranscriptExists: true,
			tabTranscripts: new Set(),
		});
		expect(plan.screen).toBe("review");
		expect(plan.reviewSession).toEqual(claude);
	});

	it("falls back when the selected Transcript vanished", () => {
		const plan = planRestore({
			workspace: reviewWorkspace({}),
			projects: [],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});
		expect(plan.screen).toBe("command");
		expect(plan.reviewSession).toBeNull();
	});

	it("indexes focus inside the restored Project list", () => {
		const plan = planRestore({
			workspace: workspace({
				focusedProjectId: "b",
				projects: [{ projectId: "b", tabs: [{ state: "empty" }], activeTab: 0 }],
			}),
			projects: [{ id: "a" }, { id: "b" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});
		expect(plan.focusedIndex).toBe(0);
	});
});
