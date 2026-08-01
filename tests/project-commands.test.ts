import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { commandDraftSchema, ProjectCommands } from "@main/store/commands";
import { assertDefined } from "./utils/assertions";

describe("project commands", () => {
	it("starts empty and keeps each project's commands to itself", async () => {
		expect(await ProjectCommands.list("p1")).toEqual([]);

		await ProjectCommands.add({ projectId: "p1", label: "Dev server", command: "bun run dev", kind: "task" });
		await ProjectCommands.add({ projectId: "p2", label: "Tests", command: "bun test", kind: "task" });

		expect((await ProjectCommands.list("p1")).map((command) => command.label)).toEqual(["Dev server"]);
		expect((await ProjectCommands.list("p2")).map((command) => command.label)).toEqual(["Tests"]);
	});

	it("rewrites a command in place and leaves its identity alone", async () => {
		const added = await ProjectCommands.add({
			projectId: "p1",
			label: "Check",
			command: "bun run chek",
			kind: "task",
		});
		const updated = await ProjectCommands.update({
			id: added.id,
			label: "Check",
			command: "bun run check",
			kind: "task",
		});

		expect(updated.id).toBe(added.id);
		expect(updated.createdAt).toBe(added.createdAt);
		expect((await ProjectCommands.find(added.id)).command).toBe("bun run check");
	});

	it("reports an update to a command that is gone instead of recreating it", async () => {
		expect(
			ProjectCommands.update({ id: "missing", label: "Check", command: "bun run check", kind: "task" }),
		).rejects.toThrow("Command not found: missing");
	});

	it("drops every command of a project when the project is removed", async () => {
		await ProjectCommands.add({ projectId: "p1", label: "Dev server", command: "bun run dev", kind: "task" });
		await ProjectCommands.add({ projectId: "p1", label: "Tests", command: "bun test", kind: "task" });
		await ProjectCommands.add({ projectId: "p2", label: "Tests", command: "bun test", kind: "task" });

		await ProjectCommands.purgeProject("p1");

		expect(await ProjectCommands.list("p1")).toEqual([]);
		expect(await ProjectCommands.list("p2")).toHaveLength(1);
	});

	it("keeps the autostart flag on a service and drops it when the command becomes a task", async () => {
		const service = await ProjectCommands.add({
			projectId: "p1",
			label: "Dev server",
			command: "bun run dev",
			kind: "service",
			autostart: true,
		});

		expect(service.autostart).toBe(true);

		const demoted = await ProjectCommands.update({
			id: service.id,
			label: "Dev server",
			command: "bun run dev",
			kind: "task",
			autostart: true,
		});

		expect(demoted.autostart).toBeUndefined();
	});

	it("lists services across every project", async () => {
		await ProjectCommands.add({ projectId: "p1", label: "Dev server", command: "bun run dev", kind: "service" });
		await ProjectCommands.add({ projectId: "p2", label: "Tests", command: "bun test", kind: "task" });

		expect((await ProjectCommands.services()).map((command) => command.label)).toEqual(["Dev server"]);
	});

	it("reads a file stored before kinds existed as a list of tasks", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(
			join(process.env.DATA_DIR, "commands.json"),
			JSON.stringify({
				version: 1,
				data: [{ id: "c1", projectId: "p1", label: "Tests", command: "bun test", createdAt: 7 }],
			}),
		);

		expect(await ProjectCommands.list("p1")).toEqual([
			{ id: "c1", projectId: "p1", label: "Tests", command: "bun test", kind: "task", createdAt: 7 },
		]);
	});

	it("refuses a draft with an empty name or an empty command line", () => {
		expect(() => commandDraftSchema.assert({ label: "", command: "bun test", kind: "task" })).toThrow();
		expect(() => commandDraftSchema.assert({ label: "Tests", command: "", kind: "task" })).toThrow();
		expect(commandDraftSchema.assert({ label: "Tests", command: "bun test", kind: "task" })).toEqual({
			label: "Tests",
			command: "bun test",
			kind: "task",
		});
	});
});
