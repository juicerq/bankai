import { describe, expect, it } from "vitest";
import { Projects } from "@core/store/projects";

describe("Projects", () => {
	it("starts empty", async () => {
		expect(await Projects.list()).toEqual([]);
	});

	it("adds a project with a trimmed cwd and name, read back from disk", async () => {
		await Projects.add({ cwd: "  /home/me/app  ", name: "  App  " });

		expect(await Projects.list()).toMatchObject([
			{ cwd: "/home/me/app", name: "App" },
		]);
	});

	it("appends in add order, preserving it across reads", async () => {
		await Projects.add({ cwd: "/a", name: "A" });
		await Projects.add({ cwd: "/b", name: "B" });
		await Projects.add({ cwd: "/c", name: "C" });

		expect((await Projects.list()).map((p) => p.name)).toEqual(["A", "B", "C"]);
	});

	it("removes a project by id and leaves the rest ordered", async () => {
		await Projects.add({ cwd: "/a", name: "A" });
		const [, second] = await Projects.add({ cwd: "/b", name: "B" });
		await Projects.add({ cwd: "/c", name: "C" });

		const remaining = await Projects.remove(second!.id);

		expect(remaining.map((p) => p.name)).toEqual(["A", "C"]);
	});

	it("renames a project by id", async () => {
		const [only] = await Projects.add({ cwd: "/a", name: "A" });

		const renamed = await Projects.rename(only!.id, "  Alpha  ");

		expect(renamed).toMatchObject([{ name: "Alpha" }]);
	});

	it("moves a project up and down, and is a no-op at the edges", async () => {
		const [first] = await Projects.add({ cwd: "/a", name: "A" });
		await Projects.add({ cwd: "/b", name: "B" });
		const [, , third] = await Projects.add({ cwd: "/c", name: "C" });

		const down = await Projects.move({ id: first!.id, direction: "down" });
		expect(down.map((p) => p.name)).toEqual(["B", "A", "C"]);

		const up = await Projects.move({ id: first!.id, direction: "up" });
		expect(up.map((p) => p.name)).toEqual(["A", "B", "C"]);

		const edge = await Projects.move({ id: third!.id, direction: "down" });
		expect(edge.map((p) => p.name)).toEqual(["A", "B", "C"]);
	});
});
