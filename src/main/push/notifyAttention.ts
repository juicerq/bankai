import { shellFocused } from "@main/activity/ShellFocus";
import { attentionPushPayload, donePushPayload } from "@main/push/attention";
import { deliverAttentionPush } from "@main/push/deliver";
import { type PushSender, sendWebPush, vapidKeys } from "@main/push/webPush";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
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

export async function pushTurnDone(
	input: { projectId: string; shellId: string },
	send: PushSender = sendWebPush,
): Promise<void> {
	if (shellFocused(input.shellId)) {
		return;
	}

	const shell = await Continuity.findShell(input);
	const project = (await Projects.list()).find((candidate) => candidate.id === input.projectId);

	await deliverAttentionPush({
		payload: donePushPayload({
			shellId: input.shellId,
			...(shell?.title ? { title: shell.title } : {}),
			...(shell?.branch ? { branch: shell.branch } : {}),
			...(project ? { project: project.name } : {}),
		}),
		vapid: vapidKeys,
		send,
	});
}
