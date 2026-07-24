import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { type } from "arktype";
import { ClaudeHarness } from "@main/activity/claude";
import { assertDefined } from "./utils/assertions";

const SMOKE_ENABLED = process.env.BANKAI_CLAUDE_SMOKE === "1";
const smokeTest = SMOKE_ENABLED ? test : test.skip;

const disposable: string[] = [];

afterAll(() => {
	for (const dir of disposable) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function disposableDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	disposable.push(dir);
	return dir;
}

function isolatedConfigDir(): string {
	const configDir = disposableDir("bankai-smoke-config-");
	const credentials = join(homedir(), ".claude", ".credentials.json");
	if (existsSync(credentials)) {
		copyFileSync(credentials, join(configDir, ".credentials.json"));
	}

	mkdirSync(join(configDir, "sessions"), { recursive: true });
	return configDir;
}

async function runClaude(args: string[], env: { configDir: string; cwd: string }): Promise<string> {
	const child = Bun.spawn(["claude", ...args, "-p", "say ok", "--output-format", "json"], {
		cwd: env.cwd,
		env: { ...process.env, CLAUDE_CONFIG_DIR: env.configDir },
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`claude exited ${exitCode}: ${stderr || stdout}`);
	}

	const result = type({ "session_id?": "string" }).assert(JSON.parse(stdout));
	assertDefined(result.session_id, `claude output lacked session_id: ${stdout}`);
	return result.session_id;
}

smokeTest("refuses to resume a conversation from a directory other than the one it started in", async () => {
	const configDir = isolatedConfigDir();
	const cwd = disposableDir("bankai-smoke-cwd-");
	const nested = join(cwd, "nested");
	mkdirSync(nested);

	const opened = await runClaude([], { configDir, cwd: nested });

	const command = ClaudeHarness.resume?.({ sessionId: opened });
	assertDefined(command);

	const outcome = await runClaude(command.args, { configDir, cwd }).then(
		(sessionId) => `resumed unexpectedly as ${sessionId}`,
		(err: unknown) => String(err),
	);

	expect(outcome).toContain(`No conversation found with session ID: ${opened}`);
}, 180_000);

smokeTest("resumes a disposable claude conversation keeping the same native session id", async () => {
	const configDir = isolatedConfigDir();
	const cwd = disposableDir("bankai-smoke-cwd-");

	const opened = await runClaude([], { configDir, cwd });

	const command = ClaudeHarness.resume?.({ sessionId: opened });
	assertDefined(command);
	expect(command).toEqual({ file: "claude", args: ["--resume", opened] });

	const resumed = await runClaude(command.args, { configDir, cwd });
	expect(resumed).toBe(opened);
}, 180_000);
