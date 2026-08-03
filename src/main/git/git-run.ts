import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const GIT_OUTPUT_MAX_BYTES = 10 * 1024 * 1024;
const GIT_TIMEOUT_MS = 5000;
const NULL_FILE = process.platform === "win32" ? "NUL" : "/dev/null";

async function gitText(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await run("git", args, {
		cwd,
		maxBuffer: GIT_OUTPUT_MAX_BYTES,
		timeout: GIT_TIMEOUT_MS,
		windowsHide: true,
	});

	return stdout;
}

async function isRepo(path: string): Promise<boolean> {
	return await gitText(path, ["rev-parse", "--is-inside-work-tree"])
		.then((out) => out.trim() === "true")
		.catch(() => false);
}

function nulSeparatedPaths(raw: string): string[] {
	return raw.split("\0").filter(Boolean);
}

function isNoIndexDifference(err: unknown): err is Error & { stdout: string } {
	if (!(err instanceof Error)) {
		return false;
	}
	if (!("code" in err) || err.code !== 1) {
		return false;
	}
	if (!("killed" in err) || err.killed !== false) {
		return false;
	}
	if (!("signal" in err) || err.signal !== null) {
		return false;
	}

	return "stdout" in err && typeof err.stdout === "string";
}

function isNoIndexPatch(err: unknown): err is Error & { stdout: string } {
	return isNoIndexDifference(err) && err.stdout.includes("diff --git ");
}

function isGitOutputOverflow(err: unknown): boolean {
	if (!(err instanceof Error) || !("code" in err)) {
		return false;
	}

	return err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

export const GitRun = {
	GIT_OUTPUT_MAX_BYTES,
	NULL_FILE,
	text: gitText,
	isRepo,
	nulPaths: nulSeparatedPaths,
	isNoIndexDifference,
	isNoIndexPatch,
	isGitOutputOverflow,
};
