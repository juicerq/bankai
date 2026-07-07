import type { FileSnapshot, Turn } from "@core/review/ReviewModel";

export type DiffMode = "turn" | "accumulated";

export function filesForMode(
	turns: Turn[],
	selectedIndex: number,
	mode: DiffMode,
): FileSnapshot[] {
	if (mode === "turn") {
		return turns[selectedIndex]?.files ?? [];
	}

	const before = new Map<string, string[]>();
	const after = new Map<string, string[]>();
	const order: string[] = [];

	for (const turn of turns) {
		for (const file of turn.files) {
			if (!before.has(file.path)) {
				before.set(file.path, file.before);
				order.push(file.path);
			}
			after.set(file.path, file.after);
		}
	}

	return order.map((path) => ({ path, before: before.get(path)!, after: after.get(path)! }));
}
