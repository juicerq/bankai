import { basename } from "node:path";

export type ProcSource = {
	pids(): Promise<number[]>;
	parent(pid: number): Promise<number | null>;
	openFiles(pid: number): Promise<string[]>;
};

export type BoundSession = {
	sessionId: string;
	transcriptPath: string;
};

function transcriptOf(files: string[]): string | undefined {
	return files.find((file) => file.endsWith(".jsonl") && file.includes("/.claude/projects/"));
}

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

async function descend(
	source: ProcSource,
	children: Map<number, number[]>,
	shellPid: number,
): Promise<BoundSession | null> {
	const seen = new Set<number>();
	let frontier = children.get(shellPid) ?? [];

	while (frontier.length > 0) {
		const batch = frontier.filter((pid) => !seen.has(pid));
		for (const pid of batch) {
			seen.add(pid);
		}

		const openFiles = await Promise.all(batch.map((pid) => source.openFiles(pid)));
		for (const files of openFiles) {
			const transcript = transcriptOf(files);
			if (transcript) {
				return { sessionId: basename(transcript, ".jsonl"), transcriptPath: transcript };
			}
		}

		frontier = batch.flatMap((pid) => children.get(pid) ?? []);
	}

	return null;
}

export const SessionBinder = {
	async resolve(source: ProcSource, shellPid: number): Promise<BoundSession | null> {
		const children = await childrenByParent(source);

		return descend(source, children, shellPid);
	},

	async resolveMany(
		source: ProcSource,
		tabs: { tabId: string; pid: number }[],
	): Promise<Record<string, string>> {
		if (tabs.length === 0) {
			return {};
		}

		const children = await childrenByParent(source);
		const bound = await Promise.all(
			tabs.map(async ({ tabId, pid }) => {
				const session = await descend(source, children, pid);

				return session ? ([tabId, session.sessionId] as const) : null;
			}),
		);

		return Object.fromEntries(bound.filter((entry) => entry !== null));
	},
};
