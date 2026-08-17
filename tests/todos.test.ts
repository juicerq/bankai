import { describe, expect, it } from "bun:test";
import { Todos } from "@main/store/todos";
import { todoDraftSchema } from "@shared/todos";

describe("todos", () => {
	it("starts empty and keeps each project's todos to itself", async () => {
		expect(await Todos.list("p1")).toEqual([]);

		await Todos.add({ projectId: "p1", text: "Write the store" });
		await Todos.add({ projectId: "p2", text: "Read the diff" });

		expect((await Todos.list("p1")).map((todo) => todo.text)).toEqual(["Write the store"]);
		expect((await Todos.list("p2")).map((todo) => todo.text)).toEqual(["Read the diff"]);
	});

	it("lists a project's todos in the order they were captured", async () => {
		await Todos.add({ projectId: "p1", text: "First" });
		await Todos.add({ projectId: "p1", text: "Second" });

		expect((await Todos.list("p1")).map((todo) => todo.text)).toEqual(["First", "Second"]);
	});

	it("opens a todo without a done instant", async () => {
		const added = await Todos.add({ projectId: "p1", text: "Write the store" });

		expect(added.doneAt).toBeUndefined();
		expect(added.createdAt).toBeNumber();
	});

	it("writes the done instant and drops it again", async () => {
		const added = await Todos.add({ projectId: "p1", text: "Write the store" });

		const done = await Todos.setDone({ id: added.id, done: true });
		expect(done.doneAt).toBeNumber();

		const reopened = await Todos.setDone({ id: added.id, done: false });
		expect(reopened.doneAt).toBeUndefined();
		expect(await Todos.list("p1")).toEqual([reopened]);
	});

	it("keeps identity and text when the done instant changes", async () => {
		const added = await Todos.add({ projectId: "p1", text: "Write the store" });

		const done = await Todos.setDone({ id: added.id, done: true });

		expect(done.id).toBe(added.id);
		expect(done.createdAt).toBe(added.createdAt);
		expect(done.text).toBe("Write the store");
	});

	it("reports a change to a todo that is gone instead of recreating it", async () => {
		expect(Todos.setDone({ id: "missing", done: true })).rejects.toThrow("Todo not found: missing");
		expect(await Todos.list("p1")).toEqual([]);
	});

	it("removes one todo and leaves the rest", async () => {
		const added = await Todos.add({ projectId: "p1", text: "Write the store" });
		await Todos.add({ projectId: "p1", text: "Read the diff" });

		await Todos.remove(added.id);

		expect((await Todos.list("p1")).map((todo) => todo.text)).toEqual(["Read the diff"]);
	});

	it("drops every todo of a project when the project is removed", async () => {
		await Todos.add({ projectId: "p1", text: "Write the store" });
		await Todos.add({ projectId: "p1", text: "Read the diff" });
		await Todos.add({ projectId: "p2", text: "Read the diff" });

		await Todos.purgeProject("p1");

		expect(await Todos.list("p1")).toEqual([]);
		expect(await Todos.list("p2")).toHaveLength(1);
	});

	it("refuses a draft with an empty text or a text past the limit", () => {
		expect(() => todoDraftSchema.assert({ text: "" })).toThrow();
		expect(() => todoDraftSchema.assert({ text: "x".repeat(2001) })).toThrow();
		expect(todoDraftSchema.assert({ text: "Write the store" })).toEqual({ text: "Write the store" });
	});
});
