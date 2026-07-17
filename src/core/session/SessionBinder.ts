import { Harnesses, type SessionDiscoveryRecord, type SessionRef } from "@core/harness/registry";
import { procFs } from "@core/proc/procFs";

export type TabBinding = { session: SessionRef; pid: number; kind?: "interactive" };

type LiveSession = { session: SessionRef; kind?: "interactive" };

export type BindInput = {
	children: Map<number, number[]>;
	records: SessionDiscoveryRecord[];
	procStartByPid: Map<number, string | null>;
	foregrounds: { tabId: string; pid: number; foreground: number | null }[];
};

function liveSessions(
	records: SessionDiscoveryRecord[],
	procStartByPid: Map<number, string | null>,
): Map<number, LiveSession> {
	const live = new Map<number, LiveSession>();
	for (const record of records) {
		if (procStartByPid.get(record.pid) !== record.procStart) {
			continue;
		}

		live.set(record.pid, {
			session: { harness: record.harness, sessionId: record.sessionId },
			...(record.kind === undefined ? {} : { kind: record.kind }),
		});
	}

	return live;
}

function findInTree(
	children: Map<number, number[]>,
	foregroundPid: number,
	live: Map<number, LiveSession>,
): number | null {
	if (live.has(foregroundPid)) {
		return foregroundPid;
	}

	const seen = new Set<number>();
	let frontier = children.get(foregroundPid) ?? [];

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

export function bindTabs(input: BindInput): Record<string, TabBinding> {
	const live = liveSessions(input.records, input.procStartByPid);
	const bound = input.foregrounds.map(({ tabId, pid, foreground }) => {
		if (foreground === null || foreground === pid) {
			return null;
		}

		const found = findInTree(input.children, foreground, live);
		const session = found === null ? undefined : live.get(found);
		if (found === null || session === undefined) {
			return null;
		}

		return [tabId, { ...session, pid: found }] as const;
	});

	return Object.fromEntries(bound.filter((entry) => entry !== null));
}

async function childrenByParent(): Promise<Map<number, number[]>> {
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

export const SessionBinder = {
	async resolveMany(tabs: { tabId: string; pid: number }[]): Promise<Record<string, TabBinding>> {
		if (tabs.length === 0) {
			return {};
		}

		const [children, records, foregrounds] = await Promise.all([
			childrenByParent(),
			Harnesses.discover(),
			Promise.all(tabs.map(async (tab) => ({
				...tab,
				foreground: await procFs.foreground(tab.pid),
			}))),
		]);

		const procStartByPid = new Map(await Promise.all(
			records.map(async (record) => [record.pid, await procFs.procStart(record.pid)] as const),
		));

		return bindTabs({ children, records, procStartByPid, foregrounds });
	},
};
