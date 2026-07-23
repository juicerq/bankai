import { Git } from "@main/git/Git";
import { gitRequestSchema, type GitResponse } from "@main/git/protocol";

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
			return await Git.snapshot(request.path, request.mode);
		case "files":
			return await Git.files({ path: request.path, files: request.files, mode: request.mode });
		case "file":
			return await Git.file({ path: request.path, file: request.file, mode: request.mode });
		case "fullFile":
			return await Git.fullFile({ path: request.path, file: request.file, mode: request.mode });
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
