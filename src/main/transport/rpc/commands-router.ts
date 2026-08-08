import { type } from "arktype";
import { base } from "@main/transport/rpc/rpc-base";
import { Services } from "@main/services";
import { ProjectCommands } from "@main/store/project-commands";
import { Projects } from "@main/store/projects";
import { projectCommandDraftSchema } from "@shared/project-commands";

export const commandsRouter = {
	list: base.input(type({ projectId: "string" })).handler(({ input }) => ProjectCommands.list(input.projectId)),
	add: base
		.input(projectCommandDraftSchema.and({ projectId: "string" }))
		.handler(async ({ input }) => {
			await Projects.find(input.projectId);

			return await ProjectCommands.add(input);
		}),
	update: base
		.input(projectCommandDraftSchema.and({ id: "string" }))
		.handler(({ input }) => ProjectCommands.update(input)),
	remove: base.input(type({ id: "string" })).handler(async ({ input }) => {
		Services.stop(input.id);

		const removed = await ProjectCommands.remove(input.id);

		Services.forget(input.id);

		return removed;
	}),
};
