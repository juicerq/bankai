import { Git } from "@main/git/git";
import { gitRequestSchema, type GitResponse } from "@main/git/git-protocol";
import { TurnBaseline } from "@main/git/review/turn-baseline";
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
			return await Git.snapshot(request);
		case "files":
			return await Git.files(request);
		case "file":
			return await Git.file(request);
		case "fullFile":
			return await Git.fullFile(request);
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
