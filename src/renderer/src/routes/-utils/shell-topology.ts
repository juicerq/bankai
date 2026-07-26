export interface ShellTab {
	id: string;
	label: string;
	plain?: boolean;
}

export interface RestoredShell {
	id: string;
	label: string;
	session?: { harness: string; sessionId: string };
}

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
	resumableShellIds: Set<string>;
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
			resumableShellIds: new Set(
				restoredShells.filter((shell) => shell.session).map((shell) => shell.id),
			),
		};
	}

	const shell = newShellTab(1);

	return {
		tabs: [shell],
		activeTabId: shell.id,
		nextShellNumber: 2,
		defaultShell: shell,
		resumableShellIds: new Set(),
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
