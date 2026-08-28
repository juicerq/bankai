import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Projects } from "@main/store/projects";
import { assertDefined } from "./utils/assertions";

describe("projects", () => {
	it("starts empty so the project picker is the only creation path", async () => {
		expect(await Projects.list()).toEqual([]);
	});

	it("persists a normalized directory and does not duplicate it", async () => {
		assertDefined(process.env.DATA_DIR);
		const projectPath = join(process.env.DATA_DIR, "workspace");
		mkdirSync(projectPath);

		const added = await Projects.add(projectPath);
		const duplicate = await Projects.add(projectPath);
		const stored = await Projects.list();

		expect(duplicate.id).toBe(added.id);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.path).toBe(projectPath);
		expect(stored[0]?.name).toBe("workspace");
		expect(stored[0]?.reviewClosedTargets).toEqual([]);
	});

	it("migrates existing projects with an empty default-closed list", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(join(process.env.DATA_DIR, "projects.json"), JSON.stringify({
			version: 1,
			data: [{ id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 1 }],
		}));

		expect(await Projects.list()).toEqual([
			{
				id: "p1",
				name: "bankai",
				path: "/projects/bankai",
				createdAt: 1,
				reviewClosedTargets: [],
			},
		]);
	});

	it("sets a file or directory default idempotently", async () => {
		assertDefined(process.env.DATA_DIR);
		const projectPath = join(process.env.DATA_DIR, "workspace");
		mkdirSync(projectPath);
		const project = await Projects.add(projectPath);
		const target = { kind: "directory" as const, path: "generated" };

		await Projects.setReviewClosedTarget(project.id, target, true);
		await Projects.setReviewClosedTarget(project.id, target, true);
		expect((await Projects.find(project.id)).reviewClosedTargets).toEqual([target]);

		await Projects.setReviewClosedTarget(project.id, target, false);
		expect((await Projects.find(project.id)).reviewClosedTargets).toEqual([]);
	});
});
