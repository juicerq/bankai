import { describe, expect, it } from "vitest";
import type { Workspace } from "@core/store/workspace";
import { planRestore } from "@core/workspace/planRestore";

function workspace(overrides: Partial<Workspace>): Workspace {
	return {
		projects: [],
		focusedProjectId: null,
		focus: "sidebar",
		zen: { command: false, review: false },
		screen: "command",
		reviewSessionId: null,
		...overrides,
	};
}

describe("planRestore", () => {
	it("drops tabs of a project no longer in projects.json", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [
					{ projectId: "p1", tabs: [{}], activeTab: 0 },
					{ projectId: "gone", tabs: [{}, {}], activeTab: 1 },
				],
			}),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.projects.map((p) => p.projectId)).toEqual(["p1"]);
	});

	it("restores a bare-shell tab as an empty command", () => {
		const plan = planRestore({
			workspace: workspace({ projects: [{ projectId: "p1", tabs: [{}], activeTab: 0 }] }),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.projects[0]?.tabs).toEqual([{}]);
	});

	it("carries a captured command through unchanged", () => {
		const captured = { sessionId: "s1", argv: ["claude"], kind: "interactive" };
		const plan = planRestore({
			workspace: workspace({
				projects: [{ projectId: "p1", tabs: [{ command: captured }], activeTab: 0 }],
			}),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(["s1"]),
		});

		expect(plan.projects[0]?.tabs[0]?.command).toEqual(captured);
	});

	it("marks a captured command resumable when its transcript exists", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [
					{ projectId: "p1", tabs: [{ command: { sessionId: "s1", argv: ["claude"] } }], activeTab: 0 },
				],
			}),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(["s1"]),
		});

		expect(plan.projects[0]?.tabs[0]?.resumable).toBe(true);
	});

	it("marks a captured command not resumable when its transcript is missing", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [
					{ projectId: "p1", tabs: [{ command: { sessionId: "s1", argv: ["claude"] } }], activeTab: 0 },
				],
			}),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.projects[0]?.tabs[0]?.resumable).toBe(false);
	});

	it("clamps an active tab index above the range to the last tab", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [{ projectId: "p1", tabs: [{}, {}], activeTab: 5 }],
			}),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.projects[0]?.activeTab).toBe(1);
	});

	it("clamps a negative active tab index to zero", () => {
		const plan = planRestore({
			workspace: workspace({
				projects: [{ projectId: "p1", tabs: [{}, {}], activeTab: -3 }],
			}),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.projects[0]?.activeTab).toBe(0);
	});

	it("falls back to the command center when the review transcript is gone", () => {
		const plan = planRestore({
			workspace: workspace({ screen: "review", reviewSessionId: "s1" }),
			projects: [],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.screen).toBe("command");
		expect(plan.reviewSessionId).toBeNull();
	});

	it("restores the review when its transcript still exists", () => {
		const plan = planRestore({
			workspace: workspace({ screen: "review", reviewSessionId: "s1" }),
			projects: [],
			reviewTranscriptExists: true,
			tabTranscripts: new Set(),
		});

		expect(plan.screen).toBe("review");
		expect(plan.reviewSessionId).toBe("s1");
	});

	it("resolves the focused project to its current index", () => {
		const plan = planRestore({
			workspace: workspace({ focusedProjectId: "p2" }),
			projects: [{ id: "p1" }, { id: "p2" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.focusedIndex).toBe(1);
	});

	it("defaults the focused index to zero when the focused project vanished", () => {
		const plan = planRestore({
			workspace: workspace({ focusedProjectId: "gone" }),
			projects: [{ id: "p1" }],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.focusedIndex).toBe(0);
	});

	it("passes focus and zen through unchanged", () => {
		const plan = planRestore({
			workspace: workspace({ focus: "terminal", zen: { command: true, review: false } }),
			projects: [],
			reviewTranscriptExists: false,
			tabTranscripts: new Set(),
		});

		expect(plan.focus).toBe("terminal");
		expect(plan.zen).toEqual({ command: true, review: false });
	});
});
