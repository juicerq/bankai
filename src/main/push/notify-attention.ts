import { ShellFocus } from "@main/terminal/shell-focus";
import { AttentionPush } from "@main/push/attention-push";
import { PushDelivery } from "@main/push/push-delivery";
import { type PushSender } from "@main/push/web-push";
import { WebPush } from "@main/push/web-push";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";

const mobileTurnShells = new Set<string>();

async function pushNeedsAttention(
	input: { projectId: string; shellId: string },
	send: PushSender = WebPush.send,
): Promise<void> {
	if (!mobileTurnShells.has(input.shellId) && ShellFocus.isFocused(input.shellId)) {
		return;
	}

	const shell = await Continuity.findShell(input);

	await PushDelivery.deliver({
		payload: AttentionPush.payload({
			shellId: input.shellId,
			...(shell?.title ? { title: shell.title } : {}),
			...(shell?.branch ? { branch: shell.branch } : {}),
		}),
		vapid: WebPush.vapid,
		send,
	});
}

async function pushTurnDone(
	input: { projectId: string; shellId: string },
	send: PushSender = WebPush.send,
): Promise<void> {
	const mobileTurn = mobileTurnShells.delete(input.shellId);

	if (!mobileTurn && ShellFocus.isFocused(input.shellId)) {
		return;
	}

	const shell = await Continuity.findShell(input);
	const project = (await Projects.list()).find((candidate) => candidate.id === input.projectId);

	await PushDelivery.deliver({
		payload: AttentionPush.donePayload({
			shellId: input.shellId,
			...(shell?.title ? { title: shell.title } : {}),
			...(shell?.branch ? { branch: shell.branch } : {}),
			...(project ? { project: project.name } : {}),
		}),
		vapid: WebPush.vapid,
		send,
	});
}

export const NotifyAttention = {
	mobileShells: mobileTurnShells,
	needsAttention: pushNeedsAttention,
	turnDone: pushTurnDone,
};
