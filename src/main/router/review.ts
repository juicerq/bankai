import { type } from "arktype";
import { Git, reviewModeSchema } from "@main/git/Git";
import { base } from "@main/router/_base";
import { Projects } from "@main/store/projects";

export const reviewRouter = {
	snapshot: base
		.input(type({ projectId: "string", mode: reviewModeSchema }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);
			return await Git.snapshot(project.path, input.mode);
		}),

	fullFile: base
		.input(type({ projectId: "string", path: "string", mode: reviewModeSchema }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);
			return await Git.fullFile({ path: project.path, file: input.path, mode: input.mode });
		}),
};
