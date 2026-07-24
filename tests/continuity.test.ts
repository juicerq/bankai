import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Continuity } from "@main/store/continuity";
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

	it("opens a shell by creating its workspace and marking it active", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });

		const { value } = await Continuity.load();
		expect(value.workspaces).toEqual([
			{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1" }] },
		]);
	});

	it("appends shells in open order, keeping the latest active and deduping by id", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2", label: "Shell 2" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });

		const { value } = await Continuity.load();
		expect(value.workspaces[0]?.shells.map((shell) => shell.id)).toEqual(["s1", "s2"]);
		expect(value.workspaces[0]?.activeShellId).toBe("s1");
	});

	it("selects an existing shell as active", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2", label: "Shell 2" } });
		await Continuity.selectShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value.workspaces[0]?.activeShellId).toBe("s1");
	});

	it("moves a shell to a new index", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2", label: "Shell 2" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s3", label: "Shell 3" } });
		await Continuity.moveShell({ projectId: "p1", shellId: "s3", toIndex: 0 });

		expect((await Continuity.load()).value.workspaces[0]?.shells.map((shell) => shell.id)).toEqual([
			"s3",
			"s1",
			"s2",
		]);
	});

	it("reassigns the active shell to the previous neighbor when the active one closes", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2", label: "Shell 2" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s3", label: "Shell 3" } });
		await Continuity.selectShell({ projectId: "p1", shellId: "s2" });
		await Continuity.closeShell({ projectId: "p1", shellId: "s2" });

		const workspace = (await Continuity.load()).value.workspaces[0];
		expect(workspace?.shells.map((shell) => shell.id)).toEqual(["s1", "s3"]);
		expect(workspace?.activeShellId).toBe("s1");
	});

	it("clears the active shell when the last shell closes", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.closeShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value.workspaces[0]).toEqual({ projectId: "p1", shells: [] });
	});

	it("remembers the active project", async () => {
		await Continuity.activateProject("p2");

		expect((await Continuity.load()).value.activeProjectId).toBe("p2");
	});

	it("purges a project's workspace and clears it as the active project", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.openShell({ projectId: "p2", shell: { id: "s2", label: "Shell 1" } });
		await Continuity.activateProject("p1");
		await Continuity.purgeProject("p1");

		const { value } = await Continuity.load();
		expect(value.workspaces.map((workspace) => workspace.projectId)).toEqual(["p2"]);
		expect(value.activeProjectId).toBeUndefined();
	});

	it("keeps a different active project when purging another workspace", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.activateProject("p2");
		await Continuity.purgeProject("p1");

		expect((await Continuity.load()).value.activeProjectId).toBe("p2");
	});

	it("rejects a file version newer than the code and rewrites a safe empty envelope", async () => {
		writeContinuityFile({ version: 3, data: { workspaces: [] } });

		const result = await Continuity.load();
		expect(result).toEqual({ value: { workspaces: [] }, failed: true });
		expect(readContinuityFile()).toEqual({ version: 2, data: { workspaces: [] } });
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
			activeProjectId: "p1",
			workspaces: [
				{
					projectId: "p1",
					activeShellId: "s2",
					shells: [{ id: "s1", label: "Shell 1" }, { id: "s2", label: "Shell 2" }],
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

describe("continuity live session refs", () => {
	const CLAUDE_REF = {
		harness: "claude",
		sessionId: "67af1e51-358c-475f-b33a-7de1e199d0a5",
		cwd: "/home/jui/projects/bankai-2/src/main",
	};

	it("stores a live session ref on the owning shell", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });

		expect((await Continuity.load()).value.workspaces[0]?.shells[0]).toEqual({
			id: "s1",
			label: "Shell 1",
			session: CLAUDE_REF,
		});
	});

	it("reads back the stored ref through the facade", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });

		expect(await Continuity.shellSession({ projectId: "p1", shellId: "s1" })).toEqual(CLAUDE_REF);
		expect(await Continuity.shellSession({ projectId: "p1", shellId: "missing" })).toBeUndefined();
	});

	it("survives a fresh store read after being persisted", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });

		expect(readContinuityFile()).toEqual({
			version: 2,
			data: {
				workspaces: [{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1", session: CLAUDE_REF }] }],
			},
		});
	});

	it("keeps a duplicated ref independently on two shells", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.openShell({ projectId: "p1", shell: { id: "s2", label: "Shell 2" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s2", session: CLAUDE_REF });

		expect(await Continuity.shellSession({ projectId: "p1", shellId: "s1" })).toEqual(CLAUDE_REF);
		expect(await Continuity.shellSession({ projectId: "p1", shellId: "s2" })).toEqual(CLAUDE_REF);
	});

	it("clears the ref when the shell returns to its prompt", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });
		await Continuity.clearShellSession({ projectId: "p1", shellId: "s1" });

		expect(await Continuity.shellSession({ projectId: "p1", shellId: "s1" })).toBeUndefined();
		expect((await Continuity.load()).value.workspaces[0]?.shells[0]).toEqual({ id: "s1", label: "Shell 1" });
	});

	it("drops the ref together with the shell when it closes", async () => {
		await Continuity.openShell({ projectId: "p1", shell: { id: "s1", label: "Shell 1" } });
		await Continuity.setShellSession({ projectId: "p1", shellId: "s1", session: CLAUDE_REF });
		await Continuity.closeShell({ projectId: "p1", shellId: "s1" });

		expect((await Continuity.load()).value.workspaces[0]?.shells).toEqual([]);
	});
});
