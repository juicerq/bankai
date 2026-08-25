import type { OpencodeRootSession } from "@main/agents/harness/opencode/opencode-db";

interface OpencodeProcess {
	pid: number;
	startedAt: number;
	sessionId?: string;
}

function bind(processes: OpencodeProcess[], sessions: OpencodeRootSession[]): Map<number, string> {
	const bound = new Map<number, string>();
	const taken = new Set<string>();

	for (const process of processes) {
		if (process.sessionId !== undefined) {
			bound.set(process.pid, process.sessionId);
			taken.add(process.sessionId);
		}
	}

	const pending = processes.filter((process) => !bound.has(process.pid));
	const byCreation = [...sessions].sort((first, second) => second.timeCreated - first.timeCreated);
	const youngestFirst = [...pending].sort((first, second) => second.startedAt - first.startedAt);

	for (const process of youngestFirst) {
		const opened = byCreation.find(
			(session) => !taken.has(session.sessionId) && session.timeCreated >= process.startedAt,
		);

		if (!opened) {
			continue;
		}

		bound.set(process.pid, opened.sessionId);
		taken.add(opened.sessionId);
	}

	const byActivity = sessions
		.filter((session) => !taken.has(session.sessionId))
		.sort((first, second) => second.timeUpdated - first.timeUpdated);
	const resumers = pending
		.filter((process) => !bound.has(process.pid))
		.sort((first, second) => first.startedAt - second.startedAt);

	for (const [index, process] of resumers.entries()) {
		const session = byActivity[index];

		if (!session) {
			break;
		}

		bound.set(process.pid, session.sessionId);
	}

	return bound;
}

export const OpencodeBinding = { bind };
