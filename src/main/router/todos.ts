import { type } from "arktype";
import { base } from "@main/router/_base";
import { Todos } from "@main/store/todos";

export const todosRouter = {
	list: base.handler(() => Todos.list()),
	create: base
		.input(type({ title: "string > 0" }))
		.handler(({ input }) => Todos.create(input)),
};
