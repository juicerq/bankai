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

export const SessionBinder = {
	async resolve(source: ProcSource, shellPid: number): Promise<BoundSession | null> {
		const children = await childrenByParent(source);

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
	},
};
