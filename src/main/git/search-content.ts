import { spawn } from "node:child_process";
import type { SearchMatch, SearchResults } from "@shared/review";

const SEARCH_TIMEOUT_MS = 30_000;
const MAX_MATCHES = 500;
const CAPITAL_LETTER = /\p{Lu}/u;

async function run({ path, query }: { path: string; query: string }): Promise<SearchResults> {
	if (!query) {
		return { matches: [], truncated: false };
	}

	const child = spawn(
		"git",
		[
			"grep",
			"--untracked",
			"-I",
			"-F",
			"-n",
			"-z",
			...(CAPITAL_LETTER.test(query) ? [] : ["-i"]),
			"-e",
			query,
		],
		{ cwd: path, windowsHide: true },
	);
	const { promise, resolve, reject } = Promise.withResolvers<SearchResults>();
	const matches: SearchMatch[] = [];
	let truncated = false;
	let pending = "";
	let stderr = "";

	const stop = () => {
		truncated = true;
		child.kill();
	};
	const timer = setTimeout(stop, SEARCH_TIMEOUT_MS);

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		if (truncated) {
			return;
		}

		pending += chunk;
		const records = pending.split("\n");
		pending = records.pop() ?? "";

		for (const record of records) {
			const match = parseRecord(record);
			if (match) {
				matches.push(match);
			}
			if (matches.length > MAX_MATCHES) {
				matches.length = MAX_MATCHES;
				stop();
				return;
			}
		}
	});

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});

	child.once("error", (err) => {
		clearTimeout(timer);
		reject(err);
	});

	child.once("close", (code, signal) => {
		clearTimeout(timer);
		if (signal !== null || code === 0 || code === 1) {
			resolve({ matches, truncated });
			return;
		}

		reject(new Error(stderr.trim() || `git grep exited with code ${code}`));
	});

	return await promise;
}

function parseRecord(record: string): SearchMatch | undefined {
	const nameEnd = record.indexOf("\0");
	const lineEnd = record.indexOf("\0", nameEnd + 1);
	if (nameEnd < 0 || lineEnd < 0) {
		return undefined;
	}

	const line = Number(record.slice(nameEnd + 1, lineEnd));
	if (!Number.isInteger(line)) {
		return undefined;
	}

	return { file: record.slice(0, nameEnd), line, text: record.slice(lineEnd + 1) };
}

export const SearchContent = {
	MAX_MATCHES,
	SEARCH_TIMEOUT_MS,
	run,
};
