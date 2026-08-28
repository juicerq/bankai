import { streamSocket } from "@renderer/lib/stream/socket";
import {
	activityAttentionEventSchema,
	activityChangedEventSchema,
	type BankaiActivityApi,
	projectActivitySnapshotSchema,
} from "@shared/activity";

export const activityStream: BankaiActivityApi = {
	watch: (projectId) => streamSocket.request("activity", "watch", { projectId }, projectActivitySnapshotSchema),
	unwatch: (projectId) => streamSocket.send("activity", "unwatch", { projectId }),
	watchAttention: () => streamSocket.send("activity", "watch-attention"),
	focusShell: (shellId) => streamSocket.send("activity", "focus-shell", { shellId }),
	onChanged: (listener) => streamSocket.on("activity", "changed", activityChangedEventSchema, listener),
	onAttention: (listener) => streamSocket.on("activity", "attention", activityAttentionEventSchema, listener),
};
