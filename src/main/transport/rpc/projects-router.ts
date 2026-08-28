import { type } from "arktype";
import { Directories } from "@main/infra/directories";
import { base } from "@main/transport/rpc/rpc-base";
import { Services } from "@main/services";
import { ProjectCommands } from "@main/store/project-commands";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { Todos } from "@main/store/todos";
import { reviewClosedTargetSchema } from "@shared/review-default-closure";

export const projectsRouter = {
	list: base.handler(() => Projects.list()),
	browse: base.input(type({ path: "string" })).handler(({ input }) => Directories.browse(input.path)),
	inspect: base.input(type({ path: "string" })).handler(({ input }) => Directories.inspectProject(input.path)),
	add: base.input(type({ path: "string" })).handler(async ({ input }) => {
		const path = await Directories.ensureProject(input.path);
		return await Projects.add(path);
	}),
	setReviewClosedTarget: base.input(type({
		projectId: "string",
		target: reviewClosedTargetSchema,
		closed: "boolean",
	})).handler(({ input }) => Projects.setReviewClosedTarget(input.projectId, input.target, input.closed)),
	remove: base.input(type({ projectId: "string" })).handler(async ({ input }) => {
		await Projects.find(input.projectId);
		Services.stopProject(input.projectId);
		await Projects.remove(input.projectId);
		await ProjectCommands.purgeProject(input.projectId);
		await Continuity.purgeProject(input.projectId);
		await Todos.purgeProject(input.projectId);
	}),
};
