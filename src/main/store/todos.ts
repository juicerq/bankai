import { randomUUID } from "node:crypto";
import { type } from "arktype";
import { Store } from "@main/store/Store";

const todoSchema = type({
	id: "string",
	title: "string",
	createdAt: "number",
});

const todosContract = todoSchema.array();

type Todo = typeof todoSchema.infer;

const store = new Store({
	name: "todos",
	version: 1,
	contract: todosContract,
	migrators: {},
	seed: () => [],
});

export const Todos = {
	list: () => store.read(),
	create: async ({ title }: { title: string }): Promise<Todo> => {
		const todo: Todo = {
			id: randomUUID(),
			title,
			createdAt: Math.floor(Date.now() / 1000),
		};
		await store.mutate((current) => [todo, ...current]);
		return todo;
	},
};
