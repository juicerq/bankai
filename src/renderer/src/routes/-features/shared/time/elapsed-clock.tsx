import { elapsedLabel } from "@renderer/routes/-features/shared/time/elapsed";
import { SECOND_MS, useClock } from "@renderer/routes/-features/shared/time/use-clock";

export function ElapsedClock({ since }: { since: number }) {
	const now = useClock(SECOND_MS);

	return (
		<span data-slot="session-elapsed" className="shrink-0 text-outline-strong">
			{elapsedLabel(now - since)}
		</span>
	);
}
