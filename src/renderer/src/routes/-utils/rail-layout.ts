export const RAIL_WIDTH_PROPERTY = "--rail-width";
export const DEFAULT_RAIL_WIDTH = 244;
export const MIN_RAIL_WIDTH = 180;
export const MAX_RAIL_WIDTH = 400;
export const RAIL_WIDTH_VALUE = `var(${RAIL_WIDTH_PROPERTY}, ${DEFAULT_RAIL_WIDTH}px)`;

export function resolveRailWidth(proposed: number): { width: number; snap: boolean } {
	if (proposed < MIN_RAIL_WIDTH) {
		return { width: MIN_RAIL_WIDTH, snap: true };
	}

	return { width: Math.min(proposed, MAX_RAIL_WIDTH), snap: false };
}
