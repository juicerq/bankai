import type { ContinuityShell } from "@main/store/continuity";

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
			nextShellNumber: nextShellNumberFrom(restoredShells),
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

function nextShellNumberFrom(shells: { label: string }[]): number {
	const numbers = shells
		.map((shell) => /^Shell (\d+)$/.exec(shell.label))
		.filter((match) => match !== null)
		.map((match) => Number(match[1]));

	if (numbers.length === 0) {
		return 1;
	}

	return Math.max(...numbers) + 1;
}
