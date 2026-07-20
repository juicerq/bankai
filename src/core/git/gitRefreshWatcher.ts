import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Logger } from "@core/logger";

export const GIT_REFRESH_INTERVAL_MS = 2000;

const run = promisify(execFile);

async function fingerprint(dir: string): Promise<string | null> {
	const status = await run("git", ["--no-optional-locks", "status", "--porcelain", "-z"], {
		cwd: dir,
		maxBuffer: 1024 * 1024 * 64,
	})
		.then((result) => result.stdout)
		.catch(() => null);
	if (status === null) {
		return null;
	}

	const head = await run("git", ["rev-parse", "HEAD"], { cwd: dir })
		.then((result) => result.stdout.trim())
		.catch(() => "");

	return `${head}\0${status}`;
}

export function watchGitRefresh(input: {
	dir: string;
	intervalMs: number;
	onChange: () => void;
}): () => void {
	let previous: string | null = null;
	let baseline = false;
	let inFlight = false;
	let stopped = false;

	const tick = async () => {
		if (inFlight) {
			return;
		}

		inFlight = true;
		const next = await fingerprint(input.dir)
			.catch((err) => {
				Logger.error("git:refresh-watch-failed", String(err));
				return null;
			})
			.finally(() => {
				inFlight = false;
			});

		if (stopped || next === null) {
			return;
		}
		if (!baseline) {
			previous = next;
			baseline = true;
			return;
		}
		if (next !== previous) {
			previous = next;
			input.onChange();
		}
	};

	void tick();
	const interval = setInterval(() => void tick(), input.intervalMs);

	return () => {
		stopped = true;
		clearInterval(interval);
	};
}
