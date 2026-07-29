import { describe, expect, it } from "bun:test";
import { commandDraftSchema, ProjectCommands } from "@main/store/commands";

describe("project commands", () => {
	it("starts empty and keeps each project's commands to itself", async () => {
		expect(await ProjectCommands.list("p1")).toEqual([]);

		await ProjectCommands.add({ projectId: "p1", label: "Dev server", command: "bun run dev" });
		await ProjectCommands.add({ projectId: "p2", label: "Tests", command: "bun test" });

		expect((await ProjectCommands.list("p1")).map((command) => command.label)).toEqual(["Dev server"]);
		expect((await ProjectCommands.list("p2")).map((command) => command.label)).toEqual(["Tests"]);
	});

	it("rewrites a command in place and leaves its identity alone", async () => {
		const added = await ProjectCommands.add({ projectId: "p1", label: "Check", command: "bun run chek" });
		const updated = await ProjectCommands.update({ id: added.id, label: "Check", command: "bun run check" });

		expect(updated.id).toBe(added.id);
		expect(updated.createdAt).toBe(added.createdAt);
		expect((await ProjectCommands.find(added.id)).command).toBe("bun run check");
	});

	it("reports an update to a command that is gone instead of recreating it", async () => {
		expect(ProjectCommands.update({ id: "missing", label: "Check", command: "bun run check" })).rejects.toThrow(
			"Command not found: missing",
		);
	});

	it("drops every command of a project when the project is removed", async () => {
		await ProjectCommands.add({ projectId: "p1", label: "Dev server", command: "bun run dev" });
		await ProjectCommands.add({ projectId: "p1", label: "Tests", command: "bun test" });
		await ProjectCommands.add({ projectId: "p2", label: "Tests", command: "bun test" });

		await ProjectCommands.purgeProject("p1");

		expect(await ProjectCommands.list("p1")).toEqual([]);
		expect(await ProjectCommands.list("p2")).toHaveLength(1);
	});

	it("refuses a draft with an empty name or an empty command line", () => {
		expect(() => commandDraftSchema.assert({ label: "", command: "bun test" })).toThrow();
		expect(() => commandDraftSchema.assert({ label: "Tests", command: "" })).toThrow();
		expect(commandDraftSchema.assert({ label: "Tests", command: "bun test" })).toEqual({
			label: "Tests",
			command: "bun test",
		});
	});
});
