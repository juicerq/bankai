const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function elapsedLabel(ms: number): string {
	const span = Math.max(0, ms);

	if (span < MINUTE) {
		return `${Math.floor(span / SECOND)}s`;
	}
	if (span < HOUR) {
		return `${Math.floor(span / MINUTE)}m`;
	}
	if (span < DAY) {
		return `${Math.floor(span / HOUR)}h${Math.floor((span % HOUR) / MINUTE)}m`;
	}

	return `${Math.floor(span / DAY)}d${Math.floor((span % DAY) / HOUR)}h`;
}
