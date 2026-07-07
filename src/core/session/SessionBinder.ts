export type ProcSource = {
	pids(): Promise<number[]>;
	parent(pid: number): Promise<number | null>;
	procStart(pid: number): Promise<string | null>;
};

export type SessionRecord = {
	pid: number;
	sessionId: string;
	procStart: string;
};

export type SessionSource = {
	list(): Promise<SessionRecord[]>;
};

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

async function liveSessions(proc: ProcSource, sessions: SessionSource): Promise<Map<number, string>> {
	const records = await sessions.list();
	const validated = await Promise.all(
		records.map(async (record) => {
			const start = await proc.procStart(record.pid);

			return start !== null && start === record.procStart ? record : null;
		}),
	);

	const live = new Map<number, string>();
	for (const record of validated) {
		if (record) {
			live.set(record.pid, record.sessionId);
		}
	}

	return live;
}

function findInTree(
	children: Map<number, number[]>,
	shellPid: number,
	live: Map<number, string>,
): string | null {
	const seen = new Set<number>();
	let frontier = children.get(shellPid) ?? [];

	while (frontier.length > 0) {
		const batch = frontier.filter((pid) => !seen.has(pid));
		for (const pid of batch) {
			seen.add(pid);

			const sessionId = live.get(pid);
			if (sessionId) {
				return sessionId;
			}
		}

		frontier = batch.flatMap((pid) => children.get(pid) ?? []);
	}

	return null;
}

export const SessionBinder = {
	async resolve(proc: ProcSource, sessions: SessionSource, shellPid: number): Promise<string | null> {
		const [children, live] = await Promise.all([
			childrenByParent(proc),
			liveSessions(proc, sessions),
		]);

		return findInTree(children, shellPid, live);
	},

	async resolveMany(
		proc: ProcSource,
		sessions: SessionSource,
		tabs: { tabId: string; pid: number }[],
	): Promise<Record<string, string>> {
		if (tabs.length === 0) {
			return {};
		}

		const [children, live] = await Promise.all([
			childrenByParent(proc),
			liveSessions(proc, sessions),
		]);

		const bound = tabs.map(({ tabId, pid }) => {
			const sessionId = findInTree(children, pid, live);

			return sessionId ? ([tabId, sessionId] as const) : null;
		});

		return Object.fromEntries(bound.filter((entry) => entry !== null));
	},
};
