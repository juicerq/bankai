import { expect, test } from "bun:test";
import { worktreeActivity } from "@renderer/routes/-utils/worktree-activity";

const SOLO = "/tmp/bankai-2-worktrees";
const PROJECT = "/home/jui/projects/bankai-2";

test("a shell's state reaches the worktree its agent runs in", () => {
	const activity = worktreeActivity({
		shellWorktrees: new Map([["shell-1", SOLO]]),
		shellActivity: new Map([["shell-1", "working"]]),
	});

	expect(activity.get(SOLO)).toBe("working");
});

test("a shell with no live agent leaves its worktree unsignalled", () => {
	const activity = worktreeActivity({
		shellWorktrees: new Map([["shell-1", SOLO]]),
		shellActivity: new Map(),
	});

	expect(activity.size).toBe(0);
});

test("shells sharing a worktree report the state that asks for a human", () => {
	const activity = worktreeActivity({
		shellWorktrees: new Map([
			["shell-1", PROJECT],
			["shell-2", PROJECT],
		]),
		shellActivity: new Map([
			["shell-1", "working"],
			["shell-2", "needs-attention"],
		]),
	});

	expect(activity.get(PROJECT)).toBe("needs-attention");
});
