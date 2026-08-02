import { filesWithContent, readFileDiff } from "@main/git/fileDiff";
import { gitRequestSchema, type GitResponse } from "@main/git/protocol";
import { snapshot } from "@main/git/reviewSnapshot";
import { captureTurnBaseline, turnBaselines } from "@main/git/TurnBaseline";
import { readWorktrees, removeWorktree } from "@main/git/Worktrees";

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
			return await snapshot(request);
		case "files":
			return await filesWithContent(request);
		case "file":
			return await readFileDiff({ scope: request, file: request.file, full: false });
		case "fullFile":
			return await readFileDiff({ scope: request, file: request.file, full: true });
		case "worktrees":
			return await readWorktrees(request.path);
		case "removeWorktree":
			await removeWorktree(request.path, request.worktree);
			return null;
		case "startTurn":
			await captureTurnBaseline(request);
			return null;
		case "forgetTurn":
			turnBaselines.delete(request.shellId);
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
