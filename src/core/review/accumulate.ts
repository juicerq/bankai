import { type FileChange, sameFileContent } from "@core/review/FileChange";
import type { Turn } from "@core/review/ReviewModel";

export type DiffMode = "turn" | "accumulated";

export function filesForMode(
	turns: Turn[],
	selectedIndex: number,
	mode: DiffMode,
): FileChange[] {
	if (mode === "turn") {
		return turns[selectedIndex]?.files ?? [];
	}
	const latest = new Map<string, string[]>();
	for (const turn of turns) {
		for (const file of turn.files) {
			const previous = latest.get(file.path);
			if (previous && !sameFileContent(previous, file.before)) {
				return turns.flatMap((entry) => entry.files);
			}
			latest.set(file.path, file.after);
		}
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

	return order.map((path) => {
		const original = before.get(path);
		const current = after.get(path);
		if (!original || !current) {
			throw new Error(`accumulated file content missing for ${path}`);
		}

		return { path, before: original, after: current };
	});
}
