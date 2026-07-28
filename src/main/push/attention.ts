import type { ShellAttention } from "@shared/activity";

export const PUSH_DEFAULT_TITLE = "Bankai";

export const PUSH_DEFAULT_BODY = "Needs attention";

export const PUSH_BODY_MAX_LENGTH = 200;

export interface AttentionPushPayload {
	title: string;
	body: string;
	data: { shellId: string };
}

export const PUSH_DONE_BODY = "Done";

interface PushSubject {
	shellId: string;
	title?: string;
	branch?: string;
}

function pushPayload(subject: PushSubject, body: string): AttentionPushPayload {
	const name = [subject.title, subject.branch].find((value) => !!value?.trim());

	return {
		title: name ?? PUSH_DEFAULT_TITLE,
		body,
		data: { shellId: subject.shellId },
	};
}

export function attentionPushPayload(input: PushSubject & { attention?: ShellAttention }): AttentionPushPayload {
	return pushPayload(input, attentionBody(input.attention));
}

export function donePushPayload(input: PushSubject & { project?: string }): AttentionPushPayload {
	return pushPayload(input, input.project?.trim() ? `${PUSH_DONE_BODY} in ${input.project}` : PUSH_DONE_BODY);
}

function attentionBody(attention: ShellAttention | undefined): string {
	if (!attention?.message.trim()) {
		return PUSH_DEFAULT_BODY;
	}
	if (!attention.detail?.trim()) {
		return capped(attention.message);
	}

	return capped(`${attention.message} — ${attention.detail}`);
}

function capped(body: string): string {
	if (body.length <= PUSH_BODY_MAX_LENGTH) {
		return body;
	}

	return `${body.slice(0, PUSH_BODY_MAX_LENGTH - 1)}…`;
}

export function subscriptionGone(statusCode?: number): boolean {
	return statusCode === 404 || statusCode === 410;
}
