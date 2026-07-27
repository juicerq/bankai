import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Continuity, type ContinuityValue } from "@main/store/continuity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import { assertDefined } from "./utils/assertions";

function writeContinuityFile(value: unknown): void {
	assertDefined(process.env.DATA_DIR);
	writeFileSync(join(process.env.DATA_DIR, "continuity.json"), JSON.stringify(value));
}

function readContinuityFile(): unknown {
	assertDefined(process.env.DATA_DIR);
	return JSON.parse(readFileSync(join(process.env.DATA_DIR, "continuity.json"), "utf8"));
}

describe("continuity store", () => {
	it("loads an empty topology for a fresh store", async () => {
		expect(await Continuity.load()).toEqual({ value: { workspaces: [] }, failed: false });
	});

	it("opens a shell by creating its workspace and selecting it", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });

		const { value } = await Continuity.load();
		expect(value).toEqual({
			selectedShellId: "s1",
			workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: expect.any(Number) }] }],
		});
	});

	it("remembers a shell that was asked to skip the harness", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", plain: true } });

		const { value } = await Continuity.load();
		expect(value.workspaces[0]?.shells[0]?.plain).toBe(true);
	});

	it("appends shells in open order, selecting the latest and deduping by id", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });

		const { value } = await Continuity.load();
		expect(value.workspaces[0]?.shells.map((shell) => shell.id)).toEqual(["s1", "s2"]);
		expect(value.selectedShellId).toBe("s1");
	});

	it("selects an existing shell", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2" } });
		await Continuity.selectShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value.selectedShellId).toBe("s1");
	});

	it("hands the selection to the newest remaining session of the project on close", async () => {
		const now = Date.now();
		writeContinuityFile({
			version: 6,
			data: {
				selectedShellId: "s2",
				workspaces: [{
					projectId: "p1",
					shells: [
						{ id: "s1", label: "Shell 1", createdAt: now - 2 },
						{ id: "s2", label: "Shell 2", createdAt: now - 1 },
						{ id: "s3", label: "Shell 3", createdAt: now },
					],
				}],
			},
		});

		await Continuity.closeShell({ projectId: "p1", shellId: "s2" });

		const { value } = await Continuity.load();
		expect(value.workspaces[0]?.shells.map((shell) => shell.id)).toEqual(["s1", "s3"]);
		expect(value.selectedShellId).toBe("s3");
	});

	it("clears the selection when the last shell closes", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.closeShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value).toEqual({ workspaces: [{ projectId: "p1", shells: [] }] });
	});

	it("purges a project's workspace and hands its selection to another project", async () => {
		await Continuity.openShell({ projectId: "p2", shell: { id: "s2" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.purgeProject("p1");

		const { value } = await Continuity.load();
		expect(value.workspaces.map((workspace) => workspace.projectId)).toEqual(["p2"]);
		expect(value.selectedShellId).toBe("s2");
	});

	it("keeps the selection when purging a workspace that does not own it", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p2", shell: { id: "s2" } });
		await Continuity.purgeProject("p1");

		expect((await Continuity.load()).value.selectedShellId).toBe("s2");
	});

	it("rejects a file version newer than the code and rewrites a safe empty envelope", async () => {
		writeContinuityFile({ version: 7, data: { workspaces: [] } });

		const result = await Continuity.load();
		expect(result).toEqual({ value: { workspaces: [] }, failed: true });
		expect(readContinuityFile()).toEqual({ version: 6, data: { workspaces: [] } });
	});

	it("promotes the v5 selection of the active project to the only selection there is", async () => {
		writeContinuityFile({
			version: 5,
			data: {
				activeProjectId: "p2",
				workspaces: [
					{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] },
					{ projectId: "p2", activeShellId: "s2", shells: [{ id: "s2", label: "Shell 1", createdAt: 2 }] },
				],
			},
		});

		const { value, failed } = await Continuity.load();

		expect(failed).toBe(false);
		expect(value).toEqual({
			selectedShellId: "s2",
			workspaces: [
				{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] },
				{ projectId: "p2", shells: [{ id: "s2", label: "Shell 1", createdAt: 2 }] },
			],
		});
	});

	it("leaves a v5 store with no active project unselected", async () => {
		writeContinuityFile({
			version: 5,
			data: {
				workspaces: [{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }],
			},
		});

		expect((await Continuity.load()).value.selectedShellId).toBeUndefined();
	});

	it("loads a v2 topology with no touch facts, leaving them absent", async () => {
		writeContinuityFile({
			version: 2,
			data: {
				workspaces: [
					{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1" }] },
				],
			},
		});

		const { value, failed } = await Continuity.load();

		expect(failed).toBe(false);
		expect(value.workspaces[0]?.shells[0]).toEqual({ id: "s1", label: "Shell 1", createdAt: 0 });
	});

	it("dates a v4 shell from its last touch, and zero when it never had one", async () => {
		writeContinuityFile({
			version: 4,
			data: {
				workspaces: [
					{
						projectId: "p1",
						shells: [
							{ id: "touched", label: "Shell 1", lastTouchedAt: 42, branch: "main" },
							{ id: "cold", label: "Shell 2" },
						],
					},
				],
			},
		});

		const { value, failed } = await Continuity.load();

		expect(failed).toBe(false);
		expect(value.workspaces[0]?.shells).toEqual([
			{ id: "touched", label: "Shell 1", lastTouchedAt: 42, branch: "main", createdAt: 42 },
			{ id: "cold", label: "Shell 2", createdAt: 0 },
		]);
	});

	it("stamps a shell with a branch and a fresh timestamp", async () => {
		const before = Date.now();
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "feat/sidebar" });

		const shell = (await Continuity.load()).value.workspaces[0]?.shells[0];
		assertDefined(shell?.lastTouchedAt);
		expect(shell.branch).toBe("feat/sidebar");
		expect(shell.lastTouchedAt).toBeGreaterThanOrEqual(before);
	});

	it("leaves other shells untouched when stamping one", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2" } });
		await Continuity.touchShell({ projectId: "p1", shellId: "s2", branch: "main" });

		const shells = (await Continuity.load()).value.workspaces[0]?.shells;
		expect(shells?.[0]).toEqual({ id: "s1", label: "Shell 1", createdAt: expect.any(Number) });
		expect(shells?.[1]?.branch).toBe("main");
	});

	it("freezes the first title a stamp brings, ignoring every later one", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main", title: "a primeira intencao" });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main", title: "outra coisa" });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main" });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]?.title).toBe("a primeira intencao");
	});

	it("keeps a renamed session's name against every later stamp", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main", title: "a intencao derivada" });
		await Continuity.renameShell({ projectId: "p1", shellId: "s1", title: "deploy watcher" });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main", title: "outra derivacao" });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]?.title).toBe("deploy watcher");
	});

	it("renames a session that never carried a derived title", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.renameShell({ projectId: "p1", shellId: "s1", title: "psql" });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]?.title).toBe("psql");
	});

	it("stamps a shell with the moment it was opened, and keeps it across a reopen", async () => {
		const before = Date.now();
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });

		const created = (await Continuity.load()).value.workspaces[0]?.shells[0]?.createdAt;
		assertDefined(created);
		expect(created).toBeGreaterThanOrEqual(before);

		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]?.createdAt).toBe(created);
	});

	it("archives a shell without dropping it or its facts", async () => {
		const before = Date.now();
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main" });
		await Continuity.archiveShell({ projectId: "p1", shellId: "s1" });

		const shell = (await Continuity.load()).value.workspaces[0]?.shells[0];
		assertDefined(shell?.archivedAt);
		expect(shell.archivedAt).toBeGreaterThanOrEqual(before);
		expect(shell.branch).toBe("main");
	});

	it("archives only the shell it names", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2" } });
		await Continuity.archiveShell({ projectId: "p1", shellId: "s2" });

		const shells = (await Continuity.load()).value.workspaces[0]?.shells;
		expect(shells?.[0]?.archivedAt).toBeUndefined();
		expect(shells?.[1]?.archivedAt).toBeDefined();
	});

	it("selecting an archived shell opens it and leaves it archived", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2" } });
		await Continuity.archiveShell({ projectId: "p1", shellId: "s1" });
		await Continuity.selectShell({ projectId: "p1", shellId: "s1" });

		const { value } = await Continuity.load();
		expect(value.workspaces[0]?.shells[0]?.archivedAt).toBeDefined();
		expect(value.selectedShellId).toBe("s1");
	});

	it("unarchiving clears the stamp and touches the shell so the window cannot refile it", async () => {
		const before = Date.now();
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.archiveShell({ projectId: "p1", shellId: "s1" });
		await Continuity.unarchiveShell({ projectId: "p1", shellId: "s1" });

		const shell = (await Continuity.load()).value.workspaces[0]?.shells[0];
		assertDefined(shell?.lastTouchedAt);
		expect(shell.archivedAt).toBeUndefined();
		expect(shell.lastTouchedAt).toBeGreaterThanOrEqual(before);
	});

	it("unarchiving a shell the window filed on its own still touches it", async () => {
		const before = Date.now();
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.unarchiveShell({ projectId: "p1", shellId: "s1" });

		const shell = (await Continuity.load()).value.workspaces[0]?.shells[0];
		assertDefined(shell?.lastTouchedAt);
		expect(shell.lastTouchedAt).toBeGreaterThanOrEqual(before);
	});

	it("selecting a shell the window already filed pins it to the archive instead of reviving it", async () => {
		const idleSince = Date.now() - SESSION_AUTO_ARCHIVE_MS - 1;
		writeContinuityFile({
			version: 5,
			data: {
				activeProjectId: "p1",
				workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 0, lastTouchedAt: idleSince }] }],
			},
		});

		await Continuity.selectShell({ projectId: "p1", shellId: "s1" });

		const { value } = await Continuity.load();
		expect(value.selectedShellId).toBe("s1");
		expect(value.workspaces[0]?.shells[0]?.archivedAt).toBe(idleSince);
	});

	it("selecting a shell the window has not filed leaves it unarchived", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.selectShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]?.archivedAt).toBeUndefined();
	});

	it("keeps a v1 topology while dropping session refs that predate the recorded directory", async () => {
		writeContinuityFile({
			version: 1,
			data: {
				activeProjectId: "p1",
				workspaces: [
					{
						projectId: "p1",
						activeShellId: "s2",
						shells: [
							{ id: "s1", label: "Shell 1", session: { harness: "claude", sessionId: "67af1e51-358c-475f-b33a-7de1e199d0a5" } },
							{ id: "s2", label: "Shell 2" },
						],
					},
				],
			},
		});

		const { value, failed } = await Continuity.load();

		expect(failed).toBe(false);
		expect(value).toEqual({
			selectedShellId: "s2",
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{ id: "s1", label: "Shell 1", createdAt: 0 },
						{ id: "s2", label: "Shell 2", createdAt: 0 },
					],
				},
			],
		});
	});

	it("rejects data that fails the contract with a safe empty fallback", async () => {
		writeContinuityFile({ version: 2, data: { workspaces: "not-an-array" } });

		const result = await Continuity.load();
		expect(result).toEqual({ value: { workspaces: [] }, failed: true });
		expect((await Continuity.load()).failed).toBe(false);
	});

	it("rejects corrupted JSON with a safe empty fallback", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(join(process.env.DATA_DIR, "continuity.json"), "{ not json");

		expect((await Continuity.load()).failed).toBe(true);
	});
});

describe("continuity push", () => {
	it("emits the whole value on every mutation, whatever wrote it", async () => {
		const pushes: ContinuityValue[] = [];
		const stop = Continuity.subscribe((value) => pushes.push(value));

		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.setShellSession({
			projectId: "p1",
			shellId: "s1",
			session: { harness: "claude", sessionId: "abc", cwd: "/tmp" },
		});
		await Continuity.touchShell({ projectId: "p1", shellId: "s1", branch: "main" });
		stop();
		await Continuity.closeShell({ projectId: "p1", shellId: "s1" });

		expect(pushes).toHaveLength(3);
		expect(pushes.at(-1)?.workspaces[0]?.shells[0]?.branch).toBe("main");
	});

	it("stops pushing to a listener that unsubscribed", async () => {
		let pushes = 0;
		Continuity.subscribe(() => {
			pushes += 1;
		})();

		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });

		expect(pushes).toBe(0);
	});
});

describe("continuity live session refs", () => {
	const CLAUDE_REF = {
		harness: "claude",
		sessionId: "67af1e51-358c-475f-b33a-7de1e199d0a5",
		cwd: "/home/jui/projects/bankai-2/src/main",
	};

	it("stores a live session ref on the owning shell", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]).toEqual({
			id: "s1",
			label: "Shell 1",
			createdAt: expect.any(Number),
			session: CLAUDE_REF,
		});
	});

	it("reads back the stored ref through the facade", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });

		expect((await Continuity.findShell({ projectId: "p1", shellId: "s1" }))?.session).toEqual(CLAUDE_REF);
		expect((await Continuity.findShell({ projectId: "p1", shellId: "missing" }))?.session).toBeUndefined();
	});

	it("survives a fresh store read after being persisted", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });

		expect(readContinuityFile()).toEqual({
			version: 6,
			data: {
				selectedShellId: "s1",
				workspaces: [{
					projectId: "p1",
					shells: [{ id: "s1", label: "Shell 1", createdAt: expect.any(Number), session: CLAUDE_REF }],
				}],
			},
		});
	});

	it("keeps a duplicated ref independently on two shells", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s2", session: CLAUDE_REF });

		expect((await Continuity.findShell({ projectId: "p1", shellId: "s1" }))?.session).toEqual(CLAUDE_REF);
		expect((await Continuity.findShell({ projectId: "p1", shellId: "s2" }))?.session).toEqual(CLAUDE_REF);
	});

	it("clears the ref when the shell returns to its prompt", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });
		await Continuity.clearShellSession({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.findShell({ projectId: "p1", shellId: "s1" }))?.session).toBeUndefined();
		expect((await Continuity.load()).value.workspaces[0]?.shells[0]).toEqual({
			id: "s1",
			label: "Shell 1",
			createdAt: expect.any(Number),
		});
	});

	it("drops the ref together with the shell when it closes", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });
		await Continuity.closeShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value.workspaces[0]?.shells).toEqual([]);
	});
});
