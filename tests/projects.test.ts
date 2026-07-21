import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Projects } from "@main/store/projects";
import { assertDefined } from "./utils/assertions";

describe("projects", () => {
	it("starts empty so the directory picker is the only creation path", async () => {
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
	});

	it("persists the order a project was dropped into", async () => {
		const dataDir = process.env.DATA_DIR;
		assertDefined(dataDir);
		for (const name of ["alpha", "beta", "gamma"]) {
			mkdirSync(join(dataDir, name));
			await Projects.add(join(dataDir, name));
		}

		const gamma = (await Projects.list())[2];
		assertDefined(gamma);
		await Projects.move({ projectId: gamma.id, toIndex: 0 });

		expect((await Projects.list()).map((project) => project.name)).toEqual(["gamma", "alpha", "beta"]);
	});
});
