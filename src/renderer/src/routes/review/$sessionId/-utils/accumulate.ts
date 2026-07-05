import type { FileDiff, Turn } from "@main/review/ReviewModel";

export type DiffMode = "turn" | "accumulated";

export function filesForMode(
	turns: Turn[],
	selectedIndex: number,
	mode: DiffMode,
): FileDiff[] {
	const selected = turns[selectedIndex];

	if (!selected) {
		return [];
	}

	if (mode === "turn") {
		return selected.files;
	}

	const byPath = new Map<string, FileDiff>();

	for (let i = 0; i <= selectedIndex; i++) {
		for (const file of turns[i]?.files ?? []) {
			byPath.set(file.path, file);
		}
	}

	return [...byPath.values()].map((file) => ({
		path: file.path,
		lines: file.lines.map((line) => ({
			...line,
			kind: line.turnId ? ("add" as const) : ("context" as const),
		})),
	}));
}
