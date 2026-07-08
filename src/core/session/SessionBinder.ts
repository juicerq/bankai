export type ProcSource = {
	pids(): Promise<number[]>;
	parent(pid: number): Promise<number | null>;
	procStart(pid: number): Promise<string | null>;
};

export type SessionRecord = {
	pid: number;
	sessionId: string;
	procStart: string;
	kind?: string;
};

export type SessionSource = {
	list(): Promise<SessionRecord[]>;
};

export type TabBinding = { sessionId: string; pid: number; kind?: string };

type LiveSession = { sessionId: string; kind?: string };

async function childrenByParent(source: ProcSource): Promise<Map<number, number[]>> {
	const pids = await source.pids();
	const parents = await Promise.all(
		pids.map(async (pid) => ({ pid, parent: await source.parent(pid) })),
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

async function liveSessions(proc: ProcSource, sessions: SessionSource): Promise<Map<number, LiveSession>> {
	const records = await sessions.list();
	const validated = await Promise.all(
		records.map(async (record) => {
			const start = await proc.procStart(record.pid);

			return start !== null && start === record.procStart ? record : null;
		}),
	);

	const live = new Map<number, LiveSession>();
	for (const record of validated) {
		if (record) {
			live.set(record.pid, { sessionId: record.sessionId, kind: record.kind });
		}
	}

	return live;
}

function findInTree(
	children: Map<number, number[]>,
	shellPid: number,
	live: Map<number, LiveSession>,
): number | null {
	const seen = new Set<number>();
	let frontier = children.get(shellPid) ?? [];

	while (frontier.length > 0) {
		const batch = frontier.filter((pid) => !seen.has(pid));
		for (const pid of batch) {
			seen.add(pid);

			if (live.has(pid)) {
				return pid;
			}
		}

		frontier = batch.flatMap((pid) => children.get(pid) ?? []);
	}

	return null;
}

export const SessionBinder = {
	async resolveMany(
		proc: ProcSource,
		sessions: SessionSource,
		tabs: { tabId: string; pid: number }[],
	): Promise<Record<string, TabBinding>> {
		if (tabs.length === 0) {
			return {};
		}

		const [children, live] = await Promise.all([
			childrenByParent(proc),
			liveSessions(proc, sessions),
		]);

		const bound = tabs.map(({ tabId, pid }) => {
			const found = findInTree(children, pid, live);
			const session = found === null ? undefined : live.get(found);
			if (found === null || session === undefined) {
				return null;
			}

			return [tabId, { ...session, pid: found }] as const;
		});

		return Object.fromEntries(bound.filter((entry) => entry !== null));
	},
};
