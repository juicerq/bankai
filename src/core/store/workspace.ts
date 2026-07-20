import { type } from "arktype";
import { Store } from "@core/store/Store";
import { sessionRef } from "@core/harness/registry";

const focusTarget = type.enumerated("sidebar", "terminal");

const workspaceExecution = type({
	"argv?": "string[]",
	"kind?": "'interactive'",
});

const workspaceTab = type({
	state: type.enumerated("empty"),
	"split?": "boolean",
	"splitRatio?": "number",
}).or(type({
	state: type.enumerated("bound"),
	session: sessionRef,
	"running?": workspaceExecution,
	"split?": "boolean",
	"splitRatio?": "number",
}));

const workspaceProject = type({
	projectId: "string",
	tabs: workspaceTab.array(),
	activeTab: "number",
});

const workspaceBase = type({
	projects: workspaceProject.array(),
	focusedProjectId: "string | null",
	focus: focusTarget,
	zen: { command: "boolean", review: "boolean" },
});
const workspaceContract = workspaceBase.merge(type({
	screen: type.enumerated("command"),
	reviewSession: "null",
})).or(workspaceBase.merge(type({
	screen: type.enumerated("review"),
	reviewSession: sessionRef,
})));

export type Workspace = typeof workspaceContract.infer;
export type WorkspaceExecution = typeof workspaceExecution.infer;
export interface WorkspaceCommand extends WorkspaceExecution {
	session: typeof sessionRef.infer;
}

export const WORKSPACE_SEED: Workspace = {
	projects: [],
	focusedProjectId: null,
	focus: "sidebar",
	zen: { command: false, review: false },
	screen: "command",
	reviewSession: null,
};

const legacyCommand = type({ sessionId: "string", "argv?": "string[]", "kind?": "string" });
const legacyWorkspace = type({
	projects: type({
		projectId: "string",
		tabs: type({ "command?": legacyCommand }).array(),
		activeTab: "number",
	}).array(),
	focusedProjectId: "string | null",
	focus: focusTarget,
	zen: { command: "boolean", review: "boolean" },
	screen: type.enumerated("command", "review"),
	reviewSessionId: "string | null",
}).pipe((workspace): Workspace => {
	const { reviewSessionId, ...base } = workspace;
	const reviewSession = reviewSessionId === null
		? null
		: { harness: "claude", sessionId: reviewSessionId };
	return workspaceContract.assert({
		...base,
		projects: workspace.projects.map((project) => ({
			...project,
				tabs: project.tabs.map((tab) => {
				if (!tab.command) {
					return { state: "empty" } as const;
				}

				const { sessionId, kind, ...rest } = tab.command;
				return {
					state: "bound" as const,
					session: { harness: "claude" as const, sessionId },
					running: kind === undefined || kind === "interactive"
						? { ...rest, kind: "interactive" as const }
						: rest,
				};
			}),
		})),
		screen: workspace.screen === "review" && reviewSession ? "review" : "command",
		reviewSession: workspace.screen === "review" ? reviewSession : null,
	});
});

export function migrateWorkspaceV1(raw: unknown): Workspace {
	return legacyWorkspace.assert(raw);
}

export const WorkspaceStore = new Store({
	name: "workspace",
	version: 2,
	contract: workspaceContract,
	migrators: { 1: migrateWorkspaceV1 },
	seed: (): Workspace => WORKSPACE_SEED,
});
