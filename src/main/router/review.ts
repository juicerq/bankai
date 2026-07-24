import { type } from "arktype";
import { reviewModeSchema, type ReviewMode } from "@main/git/contracts";
import { GitProcess } from "@main/git/GitProcess";
import { base } from "@main/router/_base";
import { Projects } from "@main/store/projects";

const scopeInput = type({ projectId: "string", mode: reviewModeSchema, "shellId?": "string" });

async function reviewScope(input: { projectId: string; mode: ReviewMode; shellId?: string }) {
	const project = await Projects.find(input.projectId);

	return { path: project.path, mode: input.mode, ...(input.shellId ? { shellId: input.shellId } : {}) };
}

export const reviewRouter = {
	snapshot: base
		.input(scopeInput)
		.handler(async ({ input }) => await GitProcess.snapshot(await reviewScope(input))),

	files: base
		.input(scopeInput.and({ files: "string[]" }))
		.handler(async ({ input }) => {
			if (new Set(input.files).size !== input.files.length) {
				throw new Error("Review file paths must be unique");
			}

			return await GitProcess.files({ ...(await reviewScope(input)), files: input.files });
		}),

	file: base
		.input(scopeInput.and({ path: "string" }))
		.handler(async ({ input }) => await GitProcess.file({ ...(await reviewScope(input)), file: input.path })),

	fullFile: base
		.input(scopeInput.and({ path: "string" }))
		.handler(async ({ input }) => await GitProcess.fullFile({ ...(await reviewScope(input)), file: input.path })),
};
