import { shellFocused } from "@main/activity/ShellFocus";
import { attentionPushPayload } from "@main/push/attention";
import { deliverAttentionPush } from "@main/push/deliver";
import { sendWebPush, vapidKeys } from "@main/push/webPush";
import { Continuity } from "@main/store/continuity";
import { PushSubscriptions } from "@main/store/push";
import type { ShellAttention } from "@shared/activity";

export async function pushNeedsAttention(input: {
	projectId: string;
	shellId: string;
	attention?: ShellAttention;
}): Promise<void> {
	if (shellFocused(input.shellId)) {
		return;
	}

	const subscriptions = await PushSubscriptions.list();
	if (subscriptions.length === 0) {
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
		vapid: await vapidKeys(),
		send: sendWebPush,
	});
}
