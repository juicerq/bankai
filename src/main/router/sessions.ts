import { type } from "arktype";
import { dialog } from "electron";
import { base } from "@main/router/_base";
import { Sessions } from "@main/sessions/SessionSupervisor";
import { Workspace } from "@main/store/workspace";

export const sessionsRouter = {
	create: base
		.input(type({ cwd: "string > 0" }))
		.handler(({ input }) => {
			const sessionId = Sessions.create(input);
			return { sessionId, cwd: input.cwd };
		}),
	resume: base
		.input(type({ sessionId: "string > 0" }))
		.handler(async ({ input }) => {
			const node = (await Workspace.get()).nodes.find(
				(n) => n.sessionId === input.sessionId,
			);

			if (!node) {
				throw new Error(`sessão ${input.sessionId} não está no workspace`);
			}

			Sessions.resume({ sessionId: node.sessionId, cwd: node.cwd });

			return { sessionId: node.sessionId, cwd: node.cwd };
		}),
	kill: base.input(type({ sessionId: "string > 0" })).handler(({ input }) => {
		Sessions.kill(input.sessionId);
		return null;
	}),
	list: base.handler(() => Sessions.list()),
	getBuffer: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => Sessions.getBuffer(input.sessionId)),
	pickCwd: base.handler(async () => {
		const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		const path = r.filePaths[0];

		if (r.canceled || !path) {
			return null;
		}

		return path;
	}),
};
