import { type } from "arktype";
import { base } from "@main/transport/rpc/rpc-base";
import { Services } from "@main/services";
import { commandDraftSchema, ProjectCommands } from "@main/store/project-commands";
import { Projects } from "@main/store/projects";

export const commandsRouter = {
	list: base.input(type({ projectId: "string" })).handler(({ input }) => ProjectCommands.list(input.projectId)),
	add: base
		.input(commandDraftSchema.and({ projectId: "string" }))
		.handler(async ({ input }) => {
			await Projects.find(input.projectId);

			return await ProjectCommands.add(input);
		}),
	update: base
		.input(commandDraftSchema.and({ id: "string" }))
		.handler(({ input }) => ProjectCommands.update(input)),
	remove: base.input(type({ id: "string" })).handler(({ input }) => {
		Services.stop(input.id);

		return ProjectCommands.remove(input.id);
	}),
};
