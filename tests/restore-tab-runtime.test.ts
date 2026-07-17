import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { assertDefined } from "./utils/assertions";

const run = promisify(execFile);

describe("restoreTabRuntime", () => {
	it("opens the planned shells before the UI starts", async () => {
		assertDefined(process.env.DATA_DIR);
		const script = `
			import { TabSupervisor } from "./src/core/terminal/TabSupervisor.ts";
			import { restoreTabRuntime } from "./src/core/workspace/restoreTabRuntime.ts";

			const supervisor = new TabSupervisor();
			const runtime = restoreTabRuntime(supervisor, [
				{ id: "project", cwd: process.env.DATA_DIR, name: "Project" },
			], {
				projects: [{ projectId: "project", tabs: [{}], activeTab: 0 }],
				focusedIndex: 0,
				focus: "terminal",
				zen: { command: false, review: false },
				screen: "command",
				reviewSession: null,
			});

			console.log(JSON.stringify({ runtime, pids: supervisor.pids().length }));
			supervisor.disposeAll();
		`;

		const { stdout } = await run("bun", ["--eval", script], {
			cwd: process.cwd(),
			env: process.env,
		});
		const result = JSON.parse(stdout.trim()) as {
			runtime: { groups: Record<string, { tabs: string[]; active: number }> };
			pids: number;
		};

		expect(result.runtime.groups.project?.tabs).toHaveLength(1);
		expect(result.runtime.groups.project?.active).toBe(0);
		expect(result.pids).toBe(1);
	});
});
