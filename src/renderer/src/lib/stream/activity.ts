import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiActivityApi, ProjectActivitySnapshot } from "@shared/activity";

export const activityStream: BankaiActivityApi = {
	watch: (projectId) => streamSocket.request<ProjectActivitySnapshot>("activity", "watch", { projectId }),
	unwatch: (projectId) => streamSocket.send("activity", "unwatch", { projectId }),
	markViewed: (sessionId) => streamSocket.send("activity", "viewed", { sessionId }),
	markShellViewed: (shellId) => streamSocket.send("activity", "viewed-shell", { shellId }),
	onChanged: (listener) => streamSocket.on("activity", "changed", listener),
};
