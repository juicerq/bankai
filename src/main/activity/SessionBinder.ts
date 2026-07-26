import { procFs } from "@main/activity/procFs";

export interface ShellProc {
	sessionId: string;
	pid: number;
	foreground: number | null;
}

export type ChildrenOf = (pid: number) => Promise<number[]>;

async function findAgentInTree(
	childrenOf: ChildrenOf,
	foreground: number,
	livePids: Set<number>,
): Promise<number | null> {
	if (livePids.has(foreground)) {
		return foreground;
	}

	const seen = new Set<number>([foreground]);
	let frontier = await childrenOf(foreground);

	while (frontier.length > 0) {
		const batch = frontier.filter((pid) => !seen.has(pid));
		for (const pid of batch) {
			seen.add(pid);
			if (livePids.has(pid)) {
				return pid;
			}
		}

		frontier = (await Promise.all(batch.map((pid) => childrenOf(pid)))).flat();
	}

	return null;
}

async function boundAgent(
	shell: ShellProc,
	livePids: Set<number>,
	childrenOf: ChildrenOf,
): Promise<number | null> {
	if (shell.foreground === null) {
		return null;
	}

	if (shell.foreground === shell.pid && !livePids.has(shell.pid)) {
		return null;
	}

	return await findAgentInTree(childrenOf, shell.foreground, livePids);
}

export async function bindShells(
	shells: ShellProc[],
	livePids: Set<number>,
	childrenOf: ChildrenOf,
): Promise<Map<string, number>> {
	const bound = await Promise.all(shells.map(async (shell) => ({
		sessionId: shell.sessionId,
		agent: await boundAgent(shell, livePids, childrenOf),
	})));

	const bindings = new Map<string, number>();
	for (const { sessionId, agent } of bound) {
		if (agent !== null) {
			bindings.set(sessionId, agent);
		}
	}

	return bindings;
}

export async function childrenReader(): Promise<ChildrenOf> {
	if (await procFs.supportsChildren()) {
		return procFs.children;
	}

	const byParent = await childrenByParent();

	return (pid) => Promise.resolve(byParent.get(pid) ?? []);
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
