export const MATERIAL_MESSAGE_LIMIT = 400;
export const MATERIAL_TOTAL_LIMIT = 1600;
export const MATERIAL_EDGE_COUNT = 3;

export function withinTotal(messages: string[]): string[] {
	const kept = [...messages];

	while (kept.join("\n").length > MATERIAL_TOTAL_LIMIT && kept.length > 1) {
		kept.splice(Math.floor(kept.length / 2), 1);
	}

	return kept;
}
