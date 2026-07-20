import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { watchGitRefresh } from "@core/git/gitRefreshWatcher";

const INTERVAL_MS = 40;

let dir: string;

function git(...args: string[]): void {
	execFileSync("git", args, { cwd: dir });
}

function write(path: string, content: string): void {
	writeFileSync(join(dir, path), content);
}

function initRepo(): void {
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function waitForFires(count: () => number, target: number): Promise<void> {
	const deadline = Date.now() + 4000;
	while (count() < target && Date.now() < deadline) {
		await delay(INTERVAL_MS);
	}
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bankai-gitwatch-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("watchGitRefresh", () => {
	it("fires once when a commit changes the repository", async () => {
		initRepo();
		write("a.ts", "one\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");
		write("a.ts", "one\ntwo\n");

		let fires = 0;
		const stop = watchGitRefresh({ dir, intervalMs: INTERVAL_MS, onChange: () => fires++ });
		await delay(INTERVAL_MS * 3);
		expect(fires).toBe(0);

		git("add", "-A");
		git("commit", "-q", "-m", "next");
		await waitForFires(() => fires, 1);
		await delay(INTERVAL_MS * 3);
		stop();

		expect(fires).toBe(1);
	});

	it("fires on a working-tree edit that never touches the index", async () => {
		initRepo();
		write("a.ts", "one\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");

		let fires = 0;
		const stop = watchGitRefresh({ dir, intervalMs: INTERVAL_MS, onChange: () => fires++ });
		await delay(INTERVAL_MS * 3);

		write("a.ts", "one\ntwo\n");
		await waitForFires(() => fires, 1);
		await delay(INTERVAL_MS * 3);
		stop();

		expect(fires).toBe(1);
	});

	it("never fires while the repository is unchanged", async () => {
		initRepo();
		write("a.ts", "one\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");

		let fires = 0;
		const stop = watchGitRefresh({ dir, intervalMs: INTERVAL_MS, onChange: () => fires++ });
		await delay(INTERVAL_MS * 6);
		stop();

		expect(fires).toBe(0);
	});

	it("never fires and never throws for a non-repo directory", async () => {
		write("loose.txt", "content\n");

		let fires = 0;
		const stop = watchGitRefresh({ dir, intervalMs: INTERVAL_MS, onChange: () => fires++ });
		await delay(INTERVAL_MS * 6);

		write("loose.txt", "changed\n");
		await delay(INTERVAL_MS * 3);
		stop();

		expect(fires).toBe(0);
	});

	it("stops firing after stop()", async () => {
		initRepo();
		write("a.ts", "one\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");

		let fires = 0;
		const stop = watchGitRefresh({ dir, intervalMs: INTERVAL_MS, onChange: () => fires++ });
		await delay(INTERVAL_MS * 3);
		stop();

		write("a.ts", "one\ntwo\n");
		await delay(INTERVAL_MS * 6);

		expect(fires).toBe(0);
	});
});
