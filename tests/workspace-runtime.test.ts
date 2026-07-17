import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type } from "arktype";
import { describe, expect, it } from "vitest";
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { WorkspaceRuntime } from "@core/workspace/WorkspaceRuntime";
import { assertDefined } from "./utils/assertions";

const run = promisify(execFile);
const resultContract = type({
	added: {
		projects: "number",
		tabs: "number",
		active: "string | null",
		pids: "number",
	},
	removed: {
		projects: "number",
		groups: "number",
		pids: "number",
	},
});

describe("WorkspaceRuntime", () => {
	it("keeps selection and tab transitions in one observable snapshot", () => {
		const supervisor = new TabSupervisor();
		const projects = [
			{ id: "one", cwd: "/one", name: "One" },
			{ id: "two", cwd: "/two", name: "Two" },
		];
		const runtime = new WorkspaceRuntime(
			supervisor,
			projects,
			0,
			{
				one: { tabs: ["one-a", "one-b"], active: 0 },
				two: { tabs: ["two-a"], active: 0 },
			},
		);
		let notifications = 0;
		const unsubscribe = runtime.subscribe(() => notifications++);

		runtime.cycleTab(1);
		runtime.selectProject(1);

		expect(runtime.snapshot().groups.one?.active).toBe(1);
		expect(runtime.snapshot().activeProjectId).toBe("two");
		expect(runtime.activateProjectAt(9)).toBe(false);
		expect(runtime.snapshot().activeProjectId).toBe("two");
		expect(notifications).toBe(2);

		unsubscribe();
		runtime.dispose();
		supervisor.disposeAll();
	});

	it("owns the complete add and remove project lifecycle", async () => {
		assertDefined(process.env.DATA_DIR);
		const script = `
			import { TabSupervisor } from "./src/core/terminal/TabSupervisor.ts";
			import { WorkspaceRuntime } from "./src/core/workspace/WorkspaceRuntime.ts";

			const supervisor = new TabSupervisor();
			const runtime = new WorkspaceRuntime(supervisor, [], 0, {});
			await runtime.selectOrAddProject(process.env.DATA_DIR);
			const addedSnapshot = runtime.snapshot();
			const project = addedSnapshot.projects[0];
			const added = {
				projects: addedSnapshot.projects.length,
				tabs: project ? addedSnapshot.groups[project.id].tabs.length : 0,
				active: addedSnapshot.activeProjectId,
				pids: supervisor.pids().length,
			};

			await runtime.removeActiveProject();
			const removedSnapshot = runtime.snapshot();
			const removed = {
				projects: removedSnapshot.projects.length,
				groups: Object.keys(removedSnapshot.groups).length,
				pids: supervisor.pids().length,
			};

			console.log(JSON.stringify({ added, removed }));
			runtime.dispose();
			supervisor.disposeAll();
		`;

		const { stdout } = await run("bun", ["--eval", script], {
			cwd: process.cwd(),
			env: process.env,
		});
		const result = resultContract.assert(JSON.parse(stdout.trim()));

		expect(result.added.projects).toBe(1);
		expect(result.added.tabs).toBe(1);
		expect(result.added.active).toBeTruthy();
		expect(result.added.pids).toBe(1);
		expect(result.removed).toEqual({ projects: 0, groups: 0, pids: 0 });
	});
});
