import { expect, test } from "bun:test";
import { worktreeActivity } from "@renderer/routes/-utils/worktree-activity";

const SOLO = "/tmp/bankai-2-worktrees";
const PROJECT = "/home/jui/projects/bankai-2";

test("a shell's state reaches the worktree its agent runs in", () => {
	const activity = worktreeActivity({
		sessionIds: { "shell-1": "session-a" },
		shellWorktrees: new Map([["shell-1", SOLO]]),
		shellActivity: new Map([["session-a", "working"]]),
	});

	expect(activity.get(SOLO)).toBe("working");
});

test("a shell with no session yet leaves its worktree unsignalled", () => {
	const activity = worktreeActivity({
		sessionIds: {},
		shellWorktrees: new Map([["shell-1", SOLO]]),
		shellActivity: new Map([["session-a", "working"]]),
	});

	expect(activity.size).toBe(0);
});

test("shells sharing a worktree report the state that asks for a human", () => {
	const activity = worktreeActivity({
		sessionIds: { "shell-1": "session-a", "shell-2": "session-b" },
		shellWorktrees: new Map([
			["shell-1", PROJECT],
			["shell-2", PROJECT],
		]),
		shellActivity: new Map([
			["session-a", "working"],
			["session-b", "needs-attention"],
		]),
	});

	expect(activity.get(PROJECT)).toBe("needs-attention");
});
