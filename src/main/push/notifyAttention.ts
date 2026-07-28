import { shellFocused } from "@main/activity/ShellFocus";
import { attentionPushPayload } from "@main/push/attention";
import { deliverAttentionPush } from "@main/push/deliver";
import { type PushSender, sendWebPush, vapidKeys } from "@main/push/webPush";
import { Continuity } from "@main/store/continuity";
import type { ShellAttention } from "@shared/activity";

export async function pushNeedsAttention(
	input: {
		projectId: string;
		shellId: string;
		attention?: ShellAttention;
	},
	send: PushSender = sendWebPush,
): Promise<void> {
	if (shellFocused(input.shellId)) {
		return;
	}

	const shell = await Continuity.findShell(input);

	await deliverAttentionPush({
		payload: attentionPushPayload({
			shellId: input.shellId,
			...(shell?.title ? { title: shell.title } : {}),
			...(shell?.branch ? { branch: shell.branch } : {}),
			...(input.attention ? { attention: input.attention } : {}),
		}),
		vapid: vapidKeys,
		send,
	});
}
