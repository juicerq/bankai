import type { Turn } from "@main/review/ReviewModel";

export function cascadeWarnings(
	turns: Pick<Turn, "turnId" | "files">[],
	flaggedTurnIds: string[],
): Map<string, number[]> {
	const flagged = new Set(flaggedTurnIds);
	const warnings = new Map<string, number[]>();

	turns.forEach((turn, index) => {
		const paths = new Set(turn.files.map((f) => f.path));
		const sources: number[] = [];

		for (let earlier = 0; earlier < index; earlier++) {
			const source = turns[earlier];

			if (!source || !flagged.has(source.turnId)) {
				continue;
			}

			if (source.files.some((f) => paths.has(f.path))) {
				sources.push(earlier);
			}
		}

		if (sources.length > 0) {
			warnings.set(turn.turnId, sources);
		}
	});

	return warnings;
}
