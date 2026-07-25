import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { Project } from "@main/store/projects";
import type { ActivityChangedEvent, AgentActivityState, BankaiActivityApi } from "@shared/activity";
import { ActivityIndicator } from "@renderer/routes/-components/activity-indicator";
import { ANNOUNCE_ENTER_MS, ANNOUNCE_EXIT_MS, ANNOUNCE_HOLD_MS } from "@renderer/routes/-utils/activity-announce";
import { get, query } from "./dom";
import { act, cleanup, render } from "./testing-library";

const projects: Project[] = [
	{ id: "alpha", name: "alpha", path: "/p/alpha", createdAt: 1 },
	{ id: "bravo", name: "bravo", path: "/p/bravo", createdAt: 2 },
	{ id: "charlie", name: "charlie", path: "/p/charlie", createdAt: 3 },
];

let watchState: Map<string, AgentActivityState>;
let listener: ((event: ActivityChangedEvent) => void) | undefined;

function emit(projectId: string, state: AgentActivityState | null) {
	act(() => listener?.({ projectId, state, shells: {}, worktreeByShellId: {} }));
}

function advance(ms: number) {
	act(() => {
		jest.advanceTimersByTime(ms);
	});
}

beforeEach(() => {
	watchState = new Map();
	listener = undefined;
	const api: BankaiActivityApi = {
		watch: async (projectId) => ({ state: watchState.get(projectId) ?? null, shells: {}, worktreeByShellId: {} }),
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
	jest.useRealTimers();
});

describe("Activity indicator", () => {
	test("renders no element while every project is quiet", () => {
		render(<ActivityIndicator projects={projects} activeProjectId="alpha" />);

		expect(query("activity-indicator")).toBeNull();
	});

	test("orders digits by rail position and excludes the active project", () => {
		render(<ActivityIndicator projects={projects} activeProjectId="alpha" />);

		emit("charlie", "working");

		const item = get("activity-indicator-item", { projectId: "charlie" });
		expect(item.dataset.digit).toBe("3");
		expect(query("activity-indicator-item", { projectId: "alpha" })).toBeNull();
	});

	test("announces on arrival then collapses to residue", () => {
		jest.useFakeTimers();
		render(<ActivityIndicator projects={projects} activeProjectId="alpha" />);

		emit("bravo", "working");
		advance(ANNOUNCE_ENTER_MS);

		const item = get("activity-indicator-item", { projectId: "bravo" });
		expect(item.dataset.phase).toBe("announce");
		expect(item.dataset.activity).toBe("working");

		advance(ANNOUNCE_HOLD_MS);
		expect(get("activity-indicator-item", { projectId: "bravo" }).dataset.phase).toBe("residue");
	});

	test("re-announces when an already-signalling project changes state", () => {
		jest.useFakeTimers();
		render(<ActivityIndicator projects={projects} activeProjectId="alpha" />);

		emit("bravo", "working");
		advance(ANNOUNCE_ENTER_MS + ANNOUNCE_HOLD_MS);
		expect(get("activity-indicator-item", { projectId: "bravo" }).dataset.phase).toBe("residue");

		emit("bravo", "needs-attention");
		advance(ANNOUNCE_ENTER_MS);

		const item = get("activity-indicator-item", { projectId: "bravo" });
		expect(item.dataset.phase).toBe("announce");
		expect(item.dataset.activity).toBe("needs-attention");
	});

	test("clearing collapses the item and removes it", () => {
		jest.useFakeTimers();
		render(<ActivityIndicator projects={projects} activeProjectId="alpha" />);

		emit("bravo", "working");
		advance(ANNOUNCE_ENTER_MS + ANNOUNCE_HOLD_MS);

		emit("bravo", null);
		expect(get("activity-indicator-item", { projectId: "bravo" }).dataset.phase).toBe("leaving");

		advance(ANNOUNCE_EXIT_MS);
		expect(query("activity-indicator")).toBeNull();
	});

	test("pre-existing activity appears as residue without announcing", async () => {
		watchState.set("bravo", "done-unseen");
		render(<ActivityIndicator projects={projects} activeProjectId="alpha" />);
		await act(async () => {});

		const item = get("activity-indicator-item", { projectId: "bravo" });
		expect(item.dataset.phase).toBe("residue");
		expect(item.dataset.activity).toBe("done-unseen");
	});
});
