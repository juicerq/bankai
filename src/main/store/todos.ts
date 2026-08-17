import { randomUUID } from "node:crypto";
import { Store } from "@main/store/store";
import { type Todo, type TodoDraft, todoSchema } from "@shared/todos";

const store = new Store({
	name: "todos",
	version: 1,
	contract: todoSchema.array(),
	migrators: {},
	seed: (): Todo[] => [],
});

function withDone(todo: Todo, done: boolean): Todo {
	const next: Todo = {
		id: todo.id,
		projectId: todo.projectId,
		text: todo.text,
		createdAt: todo.createdAt,
	};

	if (done) {
		next.doneAt = Date.now();
	}

	return next;
}

export const Todos = {
	list: async (projectId: string): Promise<Todo[]> =>
		(await store.read()).filter((todo) => todo.projectId === projectId),

	add: async (input: TodoDraft & { projectId: string }): Promise<Todo> => {
		const todo: Todo = {
			id: randomUUID(),
			projectId: input.projectId,
			text: input.text,
			createdAt: Date.now(),
		};
		await store.mutate((current) => [...current, todo]);

		return todo;
	},

	setDone: async (input: { id: string; done: boolean }): Promise<Todo> => {
		const saved = await store.mutate((current) =>
			current.map((todo) => (todo.id === input.id ? withDone(todo, input.done) : todo))
		);
		const todo = saved.find((candidate) => candidate.id === input.id);
		if (!todo) {
			throw new Error(`Todo not found: ${input.id}`);
		}

		return todo;
	},

	remove: async (id: string): Promise<void> => {
		await store.mutate((current) => current.filter((todo) => todo.id !== id));
	},

	purgeProject: async (projectId: string): Promise<void> => {
		await store.mutate((current) => current.filter((todo) => todo.projectId !== projectId));
	},
};
