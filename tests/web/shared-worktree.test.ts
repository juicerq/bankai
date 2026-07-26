import { expect, test } from "bun:test";
import type { AgentActivityState } from "@shared/activity";
import { sharedWorktreeShells } from "@renderer/routes/-utils/shared-worktree";

const PROJECT = "/home/jui/projects/bankai-2";
const SOLO = "/tmp/bankai-2-worktrees";

const TABS = [
	{ id: "shell-1", label: "Shell 1" },
	{ id: "shell-2", label: "Shell 2" },
];

function shells(overrides: {
	shellId?: string;
	worktree?: string;
	worktrees?: [string, string][];
	activity?: [string, AgentActivityState][];
}) {
	return sharedWorktreeShells({
		shellId: overrides.shellId ?? "shell-2",
		worktree: overrides.worktree ?? PROJECT,
		tabs: TABS,
		shellWorktrees: new Map(overrides.worktrees ?? [["shell-1", PROJECT], ["shell-2", PROJECT]]),
		shellActivity: new Map(overrides.activity ?? [["shell-1", "working"]]),
	});
}

test("an agent working in the same worktree is named", () => {
	expect(shells({})).toEqual(["Shell 1"]);
});

test("an agent whose turn already ended still shares the worktree", () => {
	expect(shells({ activity: [["shell-1", "done-unseen"]] })).toEqual(["Shell 1"]);
});

test("the focused shell never reports itself", () => {
	expect(shells({ shellId: "shell-1", activity: [["shell-1", "working"]] })).toEqual([]);
});

test("an agent in another worktree writes somewhere else", () => {
	expect(shells({ worktrees: [["shell-1", SOLO], ["shell-2", PROJECT]] })).toEqual([]);
});

test("a shell with no agent of its own changes nothing", () => {
	expect(shells({ activity: [] })).toEqual([]);
});

test("reading a worktree the focused shell does not work in reports nobody", () => {
	expect(shells({ worktree: SOLO, worktrees: [["shell-1", SOLO], ["shell-2", PROJECT]] })).toEqual([]);
});

test("a shell whose worktree is still unknown reports nobody", () => {
	expect(shells({ worktrees: [["shell-1", PROJECT]] })).toEqual([]);
});
