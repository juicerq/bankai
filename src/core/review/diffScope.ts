import type { GitScope } from "@core/git/gitScope";
import type { FileChange } from "@core/review/FileChange";
import type { Turn } from "@core/review/ReviewModel";

export type DiffScope = "turn" | GitScope;

const CYCLE = ["turn", "uncommitted", "branch"] as const satisfies readonly DiffScope[];

export function nextScope(scope: DiffScope): DiffScope {
	const index = CYCLE.indexOf(scope);
	return CYCLE[(index + 1) % CYCLE.length]!;
}

export function turnFiles(turns: Turn[], selectedIndex: number): FileChange[] {
	return turns[selectedIndex]?.files ?? [];
}
