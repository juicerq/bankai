import { type } from "arktype";
import { reviewModeSchema, type ReviewMode } from "@main/git/git-contracts";
import { GitProcess } from "@main/git/git-process";
import { ProjectWorktrees } from "@main/git/worktree/project-worktrees";
import { base } from "@main/transport/rpc/rpc-base";
import { Projects } from "@main/store/projects";

const worktreeInput = type({
	projectId: "string",
	"worktree?": "string",
});

const scopeInput = worktreeInput.and({
	mode: reviewModeSchema,
	"shellId?": "string",
});

async function reviewScope(input: { projectId: string; mode: ReviewMode; shellId?: string; worktree?: string }) {
	const path = await ProjectWorktrees.resolve(input);

	return { path, mode: input.mode, ...(input.shellId ? { shellId: input.shellId } : {}) };
}

export const reviewRouter = {
	worktrees: base
		.input(type({ projectId: "string" }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);

			return await ProjectWorktrees.list(project.path).catch(() => []);
		}),

	removeWorktree: base
		.input(type({ projectId: "string", worktree: "string" }))
		.handler(async ({ input }) => {
			const project = await Projects.find(input.projectId);
			const worktree = await ProjectWorktrees.resolve(input);
			if (worktree === project.path) {
				throw new Error("A project's main worktree cannot be removed");
			}

			await GitProcess.removeWorktree({ path: project.path, worktree });
			await ProjectWorktrees.list(project.path, { fresh: true });

			return null;
		}),

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

	browseFiles: base
		.input(worktreeInput)
		.handler(async ({ input }) => await GitProcess.browseFiles({ path: await ProjectWorktrees.resolve(input) })),

	browseFile: base
		.input(worktreeInput.and({ path: "string" }))
		.handler(async ({ input }) =>
			await GitProcess.browseFile({ path: await ProjectWorktrees.resolve(input), file: input.path })
		),
};
