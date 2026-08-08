import { resolve as resolvePath } from "node:path";
import type { ReviewMode } from "@shared/review";
import { GitRun } from "@main/git/git-run";
import { TurnBaseline, type Baseline } from "@main/git/review/turn-baseline";

export interface ReviewScope {
	path: string;
	mode: ReviewMode;
	shellId?: string;
}

function turnBaseline(scope: ReviewScope): Baseline | undefined {
	if (scope.mode !== "last-turn" || scope.shellId === undefined) {
		return undefined;
	}

	const baseline = TurnBaseline.byShell.get(scope.shellId);
	if (baseline?.path !== resolvePath(scope.path)) {
		return undefined;
	}

	return baseline;
}

async function branchBase(path: string): Promise<string> {
	const origin = await GitRun.text(path, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
		.then((out) => out.trim())
		.catch(() => null);

	for (const ref of [origin, "main", "master"]) {
		if (!ref) {
			continue;
		}
		const base = await GitRun.text(path, ["merge-base", ref, "HEAD"])
			.then((out) => out.trim())
			.catch(() => null);
		if (base) {
			return base;
		}
	}

	return "HEAD";
}

async function commit(scope: ReviewScope): Promise<string | null> {
	if (scope.mode === "last-turn") {
		return turnBaseline(scope)?.head ?? null;
	}

	const hasHead = await GitRun.text(scope.path, ["rev-parse", "--verify", "--quiet", "HEAD"])
		.then(() => true)
		.catch(() => false);
	if (!hasHead) {
		return null;
	}
	if (scope.mode === "uncommitted") {
		return "HEAD";
	}

	return await branchBase(scope.path);
}

export const ReviewBase = {
	CONCURRENCY: 16,
	FULL_FILE_MAX_LINES: 3000,
	turnBaseline,
	commit,
};
