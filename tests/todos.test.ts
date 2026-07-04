import { describe, expect, it } from "vitest";
import { assertDefined } from "./utils/assertions";
import { testClient } from "./utils/orpc";

describe("todos", () => {
	it("creates a todo and returns the inserted row", async () => {
		const created = await testClient.todos.create({ title: "Buy milk" });

		expect(created.title).toBe("Buy milk");
		expect(created.id).toMatch(/.+/);
	});

	it("lists todos newest first", async () => {
		await testClient.todos.create({ title: "First" });
		await testClient.todos.create({ title: "Second" });

		const list = await testClient.todos.list();

		expect(list.length).toBe(2);
		const [newest, oldest] = list;
		assertDefined(newest);
		assertDefined(oldest);
		expect(newest.title).toBe("Second");
		expect(oldest.title).toBe("First");
	});

	it("returns empty list when no todos exist", async () => {
		const list = await testClient.todos.list();

		expect(list).toEqual([]);
	});
});
