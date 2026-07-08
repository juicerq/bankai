import { type } from "arktype";
import { Store } from "@core/store/Store";

const focusTarget = type.enumerated("sidebar", "terminal");
const screen = type.enumerated("command", "review");

const workspaceCommand = type({
	sessionId: "string",
	"argv?": "string[]",
	"kind?": "string",
});

const workspaceTab = type({
	"command?": workspaceCommand,
});

const workspaceProject = type({
	projectId: "string",
	tabs: workspaceTab.array(),
	activeTab: "number",
});

const workspaceContract = type({
	projects: workspaceProject.array(),
	focusedProjectId: "string | null",
	focus: focusTarget,
	zen: { command: "boolean", review: "boolean" },
	screen,
	reviewSessionId: "string | null",
});

export type Workspace = typeof workspaceContract.infer;
export type WorkspaceCommand = typeof workspaceCommand.infer;

export const WORKSPACE_SEED: Workspace = {
	projects: [],
	focusedProjectId: null,
	focus: "sidebar",
	zen: { command: false, review: false },
	screen: "command",
	reviewSessionId: null,
};

export const WorkspaceStore = new Store({
	name: "workspace",
	version: 1,
	contract: workspaceContract,
	migrators: {},
	seed: (): Workspace => WORKSPACE_SEED,
});
