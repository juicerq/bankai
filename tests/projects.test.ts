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
});
