import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { WebSocket } from "ws";
import { ReviewChanges } from "@main/git/review/review-changes";
import { Projects } from "@main/store/projects";
import { ReviewMessages } from "@main/transport/stream/review-messages";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import type { StreamEnvelope } from "@shared/stream";
import { assertDefined } from "./utils/assertions";

test("a review change names the resolved worktree", async () => {
	assertDefined(process.env.DATA_DIR);
	const projectPath = join(process.env.DATA_DIR, "project");
	mkdirSync(projectPath);
	const project = await Projects.add(projectPath);
	const requestedWorktree = `${projectPath}/../project`;
	const sent: StreamEnvelope[] = [];
	const connection = new StreamConnection({
		readyState: WebSocket.OPEN,
		send: (data) => sent.push(JSON.parse(data)),
	});

	try {
		await ReviewMessages.handle(connection, {
			channel: "review",
			type: "watch",
			payload: { projectId: project.id, worktree: requestedWorktree },
		});
		ReviewChanges.touch(projectPath);

		expect(sent).toEqual([
			{
				channel: "review",
				type: "changed",
				payload: { projectId: project.id, worktree: projectPath },
			},
		]);
	} finally {
		connection.close();
	}
});
