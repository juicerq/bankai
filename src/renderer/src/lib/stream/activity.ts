import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiActivityApi, ProjectActivitySnapshot } from "@shared/activity";

export const activityStream: BankaiActivityApi = {
	watch: (projectId) => streamSocket.request<ProjectActivitySnapshot>("activity", "watch", { projectId }),
	unwatch: (projectId) => streamSocket.send("activity", "unwatch", { projectId }),
	watchAttention: () => streamSocket.send("activity", "watch-attention"),
	focusShell: (shellId) => streamSocket.send("activity", "focus-shell", { shellId }),
	onChanged: (listener) => streamSocket.on("activity", "changed", listener),
	onAttention: (listener) => streamSocket.on("activity", "attention", listener),
};
