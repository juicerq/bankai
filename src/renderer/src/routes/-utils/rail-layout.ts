export const RAIL_WIDTH_PROPERTY = "--rail-width";
export const DEFAULT_RAIL_WIDTH = 244;
export const MIN_RAIL_WIDTH = 144;
export const MAX_RAIL_WIDTH = 400;
export const RAIL_FOCUS_WIDTH = MIN_RAIL_WIDTH / 2;
export const RAIL_WIDTH_VALUE = `var(${RAIL_WIDTH_PROPERTY}, ${DEFAULT_RAIL_WIDTH}px)`;

export type RailResizeIntent = "dock" | "restore" | "focus";

export function resolveRailWidth(proposed: number): { width: number; intent: RailResizeIntent } {
	if (proposed < RAIL_FOCUS_WIDTH) {
		return { width: MIN_RAIL_WIDTH, intent: "focus" };
	}

	if (proposed < MIN_RAIL_WIDTH) {
		return { width: MIN_RAIL_WIDTH, intent: "restore" };
	}

	return { width: Math.min(proposed, MAX_RAIL_WIDTH), intent: "dock" };
}
