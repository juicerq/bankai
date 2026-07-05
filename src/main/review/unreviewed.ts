import type { Turn } from "@main/review/ReviewModel";

export function countUnreviewed(
	turns: Pick<Turn, "turnId">[],
	reviewedTurnIds: string[],
): number {
	const reviewed = new Set(reviewedTurnIds);

	return turns.filter((turn) => !reviewed.has(turn.turnId)).length;
}
