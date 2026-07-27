import { useCallback, useMemo, useState } from "react";
import { type ResidencyShell, shellResidency } from "@renderer/routes/-utils/shell-residency";
import { SECOND_MS, useClock } from "@renderer/routes/-utils/use-clock";
import type { AgentActivityState } from "@shared/activity";

const RESIDENCY_CLOCK_MS = 30 * SECOND_MS;

export interface ShellResidency {
	asleep: ReadonlySet<string>;
	resumable: ReadonlySet<string>;
	wake: (shellId: string) => void;
	sleep: (shellId: string) => void;
}

export function useShellResidency({
	shells,
	activity,
	statusSince,
}: {
	shells: ResidencyShell[];
	activity: ReadonlyMap<string, AgentActivityState>;
	statusSince: ReadonlyMap<string, number>;
}): ShellResidency {
	const [woken, setWoken] = useState<ReadonlySet<string>>(() => new Set());
	const now = useClock(RESIDENCY_CLOCK_MS);
	const residency = useMemo(
		() => shellResidency({ shells, activity, statusSince, woken, now }),
		[shells, activity, statusSince, woken, now],
	);

	const wake = useCallback((shellId: string) => {
		setWoken((current) => (current.has(shellId) ? current : new Set(current).add(shellId)));
	}, []);

	const sleep = useCallback((shellId: string) => {
		setWoken((current) => {
			if (!current.has(shellId)) {
				return current;
			}

			const next = new Set(current);
			next.delete(shellId);

			return next;
		});
	}, []);

	return useMemo(() => ({ ...residency, wake, sleep }), [residency, wake, sleep]);
}
