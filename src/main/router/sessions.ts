import { type } from "arktype";
import { dialog } from "electron";
import { base } from "@main/router/_base";
import { Sessions } from "@main/sessions/SessionSupervisor";

export const sessionsRouter = {
	create: base
		.input(type({ cwd: "string > 0" }))
		.handler(({ input }) => {
			const sessionId = Sessions.create(input);
			return { sessionId, cwd: input.cwd };
		}),
	kill: base.input(type({ sessionId: "string > 0" })).handler(({ input }) => {
		Sessions.kill(input.sessionId);
		return null;
	}),
	list: base.handler(() => Sessions.list()),
	pickCwd: base.handler(async () => {
		const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		const path = r.filePaths[0];

		if (r.canceled || !path) {
			return null;
		}

		return path;
	}),
};
