import { type } from "arktype";
import { base } from "@main/transport/rpc/rpc-base";
import { Projects } from "@main/store/projects";
import { Todos } from "@main/store/todos";
import { todoDraftSchema } from "@shared/todos";

export const todosRouter = {
	list: base.input(type({ projectId: "string" })).handler(({ input }) => Todos.list(input.projectId)),
	add: base.input(todoDraftSchema.and({ projectId: "string" })).handler(async ({ input }) => {
		await Projects.find(input.projectId);

		return await Todos.add(input);
	}),
	setDone: base
		.input(type({ id: "string", done: "boolean" }))
		.handler(({ input }) => Todos.setDone(input)),
	remove: base.input(type({ id: "string" })).handler(({ input }) => Todos.remove(input.id)),
};
