import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function indexTranscripts(
	root: string,
	identify: (path: string) => Promise<string | null> | string | null,
): Promise<Map<string, string>> {
	const directories = [root];
	const files: string[] = [];

	while (directories.length > 0) {
		const directory = directories.pop();
		if (!directory) {
			continue;
		}

		const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				directories.push(path);
			} else if (entry.isFile()) {
				files.push(path);
			}
		}
	}

	const identified = await Promise.all(files.map(async (path) => ({
		path,
		sessionId: await identify(path),
	})));

	return new Map(identified.flatMap(({ path, sessionId }) =>
		sessionId ? [[sessionId, path]] : []));
}

export async function readFirstLine(path: string): Promise<string | null> {
	const file = await open(path, "r").catch(() => null);
	if (!file) {
		return null;
	}

	try {
		const bytes = Buffer.alloc(64 * 1024);
		const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
		const content = bytes.subarray(0, bytesRead).toString("utf8");
		const end = content.indexOf("\n");
		return end < 0 ? null : content.slice(0, end);
	} finally {
		await file.close();
	}
}
