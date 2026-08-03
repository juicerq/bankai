export interface ShellProc {
	sessionId: string;
	pid: number;
}

export type ParentOf = (pid: number) => Promise<number | null>;

const INIT_PID = 1;

interface Binding {
	sessionId: string;
	agent: number;
	hops: number;
}

async function bindAgent(
	agent: number,
	shellsByPid: ReadonlyMap<number, string>,
	parentOf: ParentOf,
): Promise<Binding | null> {
	const seen = new Set<number>();
	let pid: number | null = agent;
	let hops = 0;

	while (pid !== null && pid > INIT_PID && !seen.has(pid)) {
		const sessionId = shellsByPid.get(pid);
		if (sessionId !== undefined) {
			return { sessionId, agent, hops };
		}

		seen.add(pid);
		pid = await parentOf(pid);
		hops += 1;
	}

	return null;
}

export async function bindShells(
	shells: ShellProc[],
	agents: Iterable<number>,
	parentOf: ParentOf,
): Promise<Map<string, number>> {
	const shellsByPid = new Map(shells.map((shell) => [shell.pid, shell.sessionId]));
	const located = await Promise.all(
		[...agents].map((agent) => bindAgent(agent, shellsByPid, parentOf)),
	);

	const bindings = new Map<string, number>();
	const nearestFirst = located
		.flatMap((binding) => binding ?? [])
		.sort((left, right) => left.hops - right.hops);
	for (const binding of nearestFirst) {
		if (!bindings.has(binding.sessionId)) {
			bindings.set(binding.sessionId, binding.agent);
		}
	}

	return bindings;
}
