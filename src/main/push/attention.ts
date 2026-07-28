import type { ShellAttention } from "@shared/activity";

export const PUSH_DEFAULT_TITLE = "Bankai";

export const PUSH_DEFAULT_BODY = "Needs attention";

export const PUSH_BODY_MAX_LENGTH = 200;

export interface AttentionPushPayload {
	title: string;
	body: string;
	data: { shellId: string };
}

export function attentionPushPayload(input: {
	shellId: string;
	title?: string;
	branch?: string;
	attention?: ShellAttention;
}): AttentionPushPayload {
	const name = [input.title, input.branch].find((value) => !!value?.trim());

	return {
		title: name ?? PUSH_DEFAULT_TITLE,
		body: attentionBody(input.attention),
		data: { shellId: input.shellId },
	};
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
