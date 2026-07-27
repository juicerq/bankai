import type { ContinuityShell } from "@main/store/continuity";
import { nextShellNumber } from "@shared/continuity-reducers";

export interface ShellTab {
	id: string;
	label: string;
	plain?: boolean;
}

export type RestoredShell = Pick<ContinuityShell, "id" | "label">;

export function newShellTab(index: number, plain?: boolean): ShellTab {
	const tab: ShellTab = { id: crypto.randomUUID(), label: `Shell ${index}` };

	if (plain) {
		return { ...tab, plain };
	}

	return tab;
}

export interface ShellTopology {
	tabs: ShellTab[];
	activeTabId: string | undefined;
	nextShellNumber: number;
	defaultShell: ShellTab | undefined;
}

export function initialShellTopology(
	restoredShells?: RestoredShell[],
	restoredActiveShellId?: string,
): ShellTopology {
	if (restoredShells && restoredShells.length > 0) {
		return {
			tabs: restoredShells.map((shell) => ({ id: shell.id, label: shell.label })),
			activeTabId: restoredActiveShellId ?? restoredShells[0]?.id,
			nextShellNumber: nextShellNumber(restoredShells),
			defaultShell: undefined,
		};
	}

	const shell = newShellTab(1);

	return {
		tabs: [shell],
		activeTabId: shell.id,
		nextShellNumber: 2,
		defaultShell: shell,
	};
}
