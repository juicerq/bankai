import type { Turn } from "@core/review/ReviewModel";

export function countUnreviewed(
	turns: Pick<Turn, "turnId">[],
	reviewedTurnIds: string[],
): number {
	const reviewed = new Set(reviewedTurnIds);

	return turns.filter((turn) => !reviewed.has(turn.turnId)).length;
}

export function canReviewTurn(turns: Pick<Turn, "turnId" | "state">[], turnId: string): boolean {
	return turns.some((turn) => turn.turnId === turnId && turn.state !== "active");
}
