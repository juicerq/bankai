import { ShellAgents, type ProcReader } from "@main/terminal/shell-agents";

interface ShellProc {
	sessionId: string;
	shellId: string;
	pid: number;
}

export type ParentOf = (pid: number) => Promise<number | null>;

const INIT_PID = 1;

const STAMP_HOPS = -1;

interface Binding {
	sessionId: string;
	agent: number;
	hops: number;
}

interface BindInput {
	shells: ShellProc[];
	agents: Iterable<number>;
	parentOf: ParentOf;
	reader?: ProcReader;
}

interface AgentInput {
	agent: number;
	sessionsByShellPid: ReadonlyMap<number, string>;
	sessionsByShellId: ReadonlyMap<string, string>;
	parentOf: ParentOf;
	reader: ProcReader;
}

async function bindAgent(input: AgentInput): Promise<Binding | null> {
	const stamped = await ShellAgents.shellOf(input.agent, input.reader);
	const stampedSession =
		stamped === undefined ? undefined : input.sessionsByShellId.get(stamped);

	if (stampedSession !== undefined) {
		return { sessionId: stampedSession, agent: input.agent, hops: STAMP_HOPS };
	}

	const seen = new Set<number>();
	let pid: number | null = input.agent;
	let hops = 0;

	while (pid !== null && pid > INIT_PID && !seen.has(pid)) {
		const sessionId = input.sessionsByShellPid.get(pid);
		if (sessionId !== undefined) {
			return { sessionId, agent: input.agent, hops };
		}

		seen.add(pid);
		pid = await input.parentOf(pid);
		hops += 1;
	}

	return null;
}

async function bindShells(input: BindInput): Promise<Map<string, number>> {
	const sessionsByShellPid = new Map(input.shells.map((shell) => [shell.pid, shell.sessionId]));
	const sessionsByShellId = new Map(input.shells.map((shell) => [shell.shellId, shell.sessionId]));
	const reader = input.reader ?? ShellAgents.proc;
	const located = await Promise.all(
		[...input.agents].map((agent) =>
			bindAgent({
				agent,
				sessionsByShellPid,
				sessionsByShellId,
				parentOf: input.parentOf,
				reader,
			}),
		),
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

export const SessionBinder = {
	bind: bindShells,
};
