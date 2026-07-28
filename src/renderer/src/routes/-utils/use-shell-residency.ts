import { useCallback, useMemo, useState } from "react";
import type { ContinuityShell } from "@main/store/continuity";

export type ResidencyShell = Pick<ContinuityShell, "id" | "archivedAt" | "session">;

export interface ShellResidency {
	asleep: ReadonlySet<string>;
	resumable: ReadonlySet<string>;
	wake: (shellId: string) => void;
	sleep: (shellId: string) => void;
}

export function useShellResidency({ shells }: { shells: ResidencyShell[] }): ShellResidency {
	const [woken, setWoken] = useState<ReadonlySet<string>>(() => new Set());
	const residency = useMemo(() => {
		const asleep = new Set<string>();
		const resumable = new Set<string>();

		for (const shell of shells) {
			if (shell.session) {
				resumable.add(shell.id);
			}

			if (shell.archivedAt !== undefined && !woken.has(shell.id)) {
				asleep.add(shell.id);
			}
		}

		return { asleep, resumable };
	}, [shells, woken]);

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
