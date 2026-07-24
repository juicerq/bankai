import { procFs } from "@main/activity/procFs";

export interface ShellProc {
	sessionId: string;
	pid: number;
	foreground: number | null;
}

function findAgentInTree(
	children: Map<number, number[]>,
	foreground: number,
	livePids: Set<number>,
): number | null {
	if (livePids.has(foreground)) {
		return foreground;
	}

	const seen = new Set<number>();
	let frontier = children.get(foreground) ?? [];

	while (frontier.length > 0) {
		const batch = frontier.filter((pid) => !seen.has(pid));
		for (const pid of batch) {
			seen.add(pid);
			if (livePids.has(pid)) {
				return pid;
			}
		}

		frontier = batch.flatMap((pid) => children.get(pid) ?? []);
	}

	return null;
}

export function bindShells(
	shells: ShellProc[],
	livePids: Set<number>,
	children: Map<number, number[]>,
): Map<string, number> {
	const bindings = new Map<string, number>();
	for (const shell of shells) {
		if (shell.foreground === null || shell.foreground === shell.pid) {
			continue;
		}

		const agent = findAgentInTree(children, shell.foreground, livePids);
		if (agent !== null) {
			bindings.set(shell.sessionId, agent);
		}
	}

	return bindings;
}

export async function childrenByParent(): Promise<Map<number, number[]>> {
	const pids = await procFs.pids();
	const parents = await Promise.all(
		pids.map(async (pid) => ({ pid, parent: await procFs.parent(pid) })),
	);

	const children = new Map<number, number[]>();
	for (const { pid, parent } of parents) {
		if (parent === null) {
			continue;
		}

		const siblings = children.get(parent) ?? [];
		siblings.push(pid);
		children.set(parent, siblings);
	}

	return children;
}
