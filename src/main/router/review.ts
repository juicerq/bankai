import { type } from "arktype";
import { reviewModeSchema } from "@main/git/contracts";
import { GitProcess } from "@main/git/GitProcess";
import { base } from "@main/router/_base";
import { Projects } from "@main/store/projects";

export const reviewRouter = {
	snapshot: base
		.input(type({ projectId: "string", mode: reviewModeSchema }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);
			return await GitProcess.snapshot(project.path, input.mode);
		}),

	file: base
		.input(type({ projectId: "string", path: "string", mode: reviewModeSchema }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);
			return await GitProcess.file({ path: project.path, file: input.path, mode: input.mode });
		}),

	fullFile: base
		.input(type({ projectId: "string", path: "string", mode: reviewModeSchema }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);
			return await GitProcess.fullFile({ path: project.path, file: input.path, mode: input.mode });
		}),
};
