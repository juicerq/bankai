import { BrowseFiles } from "@main/git/browse-files";
import { ChangedFiles } from "@main/git/changed-files";
import { FileDiff } from "@main/git/file-diff";
import { gitRequestSchema, type GitResponse } from "@main/git/git-protocol";
import { TurnBaseline } from "@main/git/review/turn-baseline";
import { SearchContent } from "@main/git/search-content";
import { Worktrees } from "@main/git/worktree/worktrees";

let queue = Promise.resolve();

process.parentPort.on("message", (event) => {
	queue = queue.then(async () => {
		const raw: unknown = event.data;
		const id = requestId(raw);

		try {
			const request = gitRequestSchema.assert(raw);
			const result = await execute(request);
			// Electron ParentPort has no target-origin parameter.
			// eslint-disable-next-line unicorn/require-post-message-target-origin
			process.parentPort.postMessage({ id: request.id, ok: true, result } satisfies GitResponse);
		} catch (err) {
			// Electron ParentPort has no target-origin parameter.
			// eslint-disable-next-line unicorn/require-post-message-target-origin
			process.parentPort.postMessage({ id, ok: false, error: errorMessage(err) } satisfies GitResponse);
		}
	});
});

async function execute(request: typeof gitRequestSchema.infer) {
	switch (request.operation) {
		case "snapshot":
			return await ChangedFiles.snapshot(request);
		case "files":
			return await FileDiff.many(request);
		case "file":
			return await FileDiff.one(request);
		case "fullFile":
			return await FileDiff.full(request);
		case "browseFiles":
			return await BrowseFiles.list(request.path);
		case "browseFile":
			return await BrowseFiles.read(request);
		case "searchContent":
			return await SearchContent.run(request);
		case "worktrees":
			return await Worktrees.read(request.path);
		case "removeWorktree":
			await Worktrees.remove(request.path, request.worktree);
			return null;
		case "startTurn":
			await TurnBaseline.capture(request);
			return null;
		case "forgetTurn":
			TurnBaseline.byShell.delete(request.shellId);
			return null;
	}
}

function requestId(value: unknown): string {
	if (typeof value === "object" && value !== null && "id" in value && typeof value.id === "string") {
		return value.id;
	}

	return "invalid-request";
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}

	return String(err);
}
