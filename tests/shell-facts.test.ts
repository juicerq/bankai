import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";
import { ShellFacts } from "@main/agents/session/shell-facts";
import { BranchLabel } from "@main/git/branch-label";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { ShellTitles } from "@main/terminal/shell-titles";
import { assertDefined } from "./utils/assertions";

function directory(name: string): string {
	assertDefined(process.env.DATA_DIR);
	const path = join(process.env.DATA_DIR, name);
	mkdirSync(path);
	return path;
}

function repo(name: string, branch: string): string {
	const path = directory(name);
	execFileSync("git", ["init", "-b", branch], { cwd: path });
	execFileSync("git", ["config", "user.email", "test@bankai.dev"], { cwd: path });
	execFileSync("git", ["config", "user.name", "Bankai"], { cwd: path });
	writeFileSync(join(path, "README.md"), "readme\n");
	execFileSync("git", ["add", "."], { cwd: path });
	execFileSync("git", ["commit", "-m", "initial"], { cwd: path });
	return path;
}

beforeEach(() => {
	process.env.CLAUDE_CONFIG_DIR = process.env.DATA_DIR;
});

afterEach(() => {
	delete process.env.CLAUDE_CONFIG_DIR;
});

async function shell(projectId: string, shellId: string) {
	const { value } = await Continuity.load();
	return value.workspaces
		.find((workspace) => workspace.projectId === projectId)
		?.shells.find((entry) => entry.id === shellId);
}

describe("BranchLabel.of", () => {
	it("reads the checked out branch of a repository", async () => {
		expect(await BranchLabel.of(repo("repo", "feat/sidebar"))).toBe("feat/sidebar");
	});

	it("falls back to the folder name outside a repository", async () => {
		expect(await BranchLabel.of(directory("loose-folder"))).toBe("loose-folder");
	});

	it("falls back to the folder name on a detached head", async () => {
		const path = repo("detached", "main");
		execFileSync("git", ["checkout", "--detach"], { cwd: path });

		expect(await BranchLabel.of(path)).toBe("detached");
	});
});

describe("ShellFacts.stamp", () => {
	it("stamps a timestamp and the project's branch on the shell", async () => {
		const project = await Projects.add(repo("stamped", "feat/flat-list"));
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });

		const before = Date.now();
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		const stamped = await shell(project.id, "s1");
		assertDefined(stamped?.lastTouchedAt);
		expect(stamped.branch).toBe("feat/flat-list");
		expect(stamped.lastTouchedAt).toBeGreaterThanOrEqual(before);
	});

	it("resolves the branch from the agent session's directory when the shell has one", async () => {
		const project = await Projects.add(repo("owner", "main"));
		const worktree = repo("agent-cwd", "feat/agent");
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await Continuity.setShellSession({
			projectId: project.id,
			shellId: "s1",
			session: { harness: "claude", sessionId: "abc", cwd: worktree },
		});
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.branch).toBe("feat/agent");
	});

	it("prefers an explicit directory over the shell's own", async () => {
		const project = await Projects.add(repo("explicit", "main"));
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1", cwd: repo("other-tree", "feat/other") });

		expect((await shell(project.id, "s1"))?.branch).toBe("feat/other");
	});

	it("holds a stale branch until the next stamp", async () => {
		const path = repo("renamed", "main");
		const project = await Projects.add(path);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });
		execFileSync("git", ["checkout", "-b", "feat/moved"], { cwd: path });

		expect((await shell(project.id, "s1"))?.branch).toBe("main");

		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.branch).toBe("feat/moved");
	});
});

describe("ShellFacts.stamp titles", () => {
	afterEach(() => {
		ShellTitles.forget("s1");
	});

	function claudeSession(input: { projectId: string; sessionId: string; cwd: string; intent: string; title?: string }) {
		const path = ClaudeTranscript.path({ sessionId: input.sessionId, cwd: input.cwd });
		mkdirSync(join(path, ".."), { recursive: true });
		const records = [
			JSON.stringify({ type: "user", message: { content: input.intent } }),
			...(input.title ? [JSON.stringify({ type: "ai-title", aiTitle: input.title, sessionId: input.sessionId })] : []),
		];
		writeFileSync(path, `${records.join("\n")}\n`);

		return Continuity.setShellSession({
			projectId: input.projectId,
			shellId: "s1",
			session: { harness: "claude", sessionId: input.sessionId, cwd: input.cwd },
		});
	}

	it("does not use the agent's first message as its session name", async () => {
		const cwd = repo("agent-titled", "main");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "arruma o header" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBeUndefined();
	});

	it("keeps reading until the harness publishes a session name", async () => {
		const cwd = repo("eventually-titled", "main");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "arruma o header" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });
		await claudeSession({
			projectId: project.id,
			sessionId: "abc",
			cwd,
			intent: "arruma o header",
			title: "Arrumar o header",
		});
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBe("Arrumar o header");
	});

	it("titles an agentless shell with the raw title its own shell wrote", async () => {
		const project = await Projects.add(repo("osc-titled", "main"));
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		ShellTitles.note("s1", "\u001b]0;jui@box: ~/projects\u0007");
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBe("jui@box: ~/projects");
	});

	it("follows the harness's title when the session resumes under a new id", async () => {
		const cwd = repo("resumed", "main");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "first", cwd, intent: "a intencao original", title: "A intenção original" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });
		await claudeSession({ projectId: project.id, sessionId: "second", cwd, intent: "outra coisa", title: "Outro assunto" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBe("Outro assunto");
	});

	it("keeps the name it read for a session when the harness publishes another one", async () => {
		const cwd = repo("republished", "main");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "oi", title: "O primeiro assunto" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "oi", title: "Outro assunto" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBe("O primeiro assunto");
	});

	it("never takes a harness title back from a name the user typed", async () => {
		const cwd = repo("user-named", "main");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "arruma o header" });
		await Continuity.renameShell({ projectId: project.id, shellId: "s1", title: "meu nome" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBe("meu nome");
	});

	it("leaves a shell untitled when nothing yields a title, and still stamps its branch", async () => {
		const cwd = repo("untitled", "feat/no-title");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({
			projectId: project.id,
			sessionId: "quiet",
			cwd,
			intent: "<system-reminder>only noise</system-reminder>",
		});
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		const stamped = await shell(project.id, "s1");
		expect(stamped?.title).toBeUndefined();
		expect(stamped?.branch).toBe("feat/no-title");
	});

	it("takes only the session name the harness publishes", async () => {
		const cwd = repo("published", "main");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "oi", title: "Revisar o sidebar" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		const stamped = await shell(project.id, "s1");
		expect(stamped?.title).toBe("Revisar o sidebar");
		expect(stamped?.titleSource).toBe("harness");
		expect(stamped?.branch).toBe("main");
	});

	it("leaves the name the user typed alone and still stamps the branch", async () => {
		const cwd = repo("hand-named", "feat/mine");
		const project = await Projects.add(cwd);
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await claudeSession({ projectId: project.id, sessionId: "abc", cwd, intent: "arruma o header", title: "Arrumar o header" });
		await Continuity.renameShell({ projectId: project.id, shellId: "s1", title: "psql" });
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		const stamped = await shell(project.id, "s1");
		expect(stamped?.title).toBe("psql");
		expect(stamped?.titleSource).toBe("user");
		expect(stamped?.branch).toBe("feat/mine");
	});

	it("leaves a shell untitled when its harness cannot derive one", async () => {
		const project = await Projects.add(repo("unknown-harness", "main"));
		await Continuity.openShell({ projectId: project.id, shell: { id: "s1" } });
		await Continuity.setShellSession({
			projectId: project.id,
			shellId: "s1",
			session: { harness: "codex", sessionId: "abc", cwd: repo("codex-cwd", "main") },
		});
		ShellTitles.note("s1", "\u001b]0;not this one\u0007");
		await ShellFacts.stamp({ projectId: project.id, shellId: "s1" });

		expect((await shell(project.id, "s1"))?.title).toBeUndefined();
	});
});
