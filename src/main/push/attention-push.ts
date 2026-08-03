const PUSH_DEFAULT_TITLE = "Bankai";

const PUSH_DEFAULT_BODY = "Needs attention";

export interface AttentionPushPayload {
	title: string;
	body: string;
	data: { shellId: string };
}

const PUSH_DONE_BODY = "Done";

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

function attentionPushPayload(input: PushSubject): AttentionPushPayload {
	return pushPayload(input, PUSH_DEFAULT_BODY);
}

function donePushPayload(input: PushSubject & { project?: string }): AttentionPushPayload {
	return pushPayload(input, input.project?.trim() ? `${PUSH_DONE_BODY} in ${input.project}` : PUSH_DONE_BODY);
}

function subscriptionGone(statusCode?: number): boolean {
	return statusCode === 404 || statusCode === 410;
}

export const AttentionPush = {
	PUSH_DEFAULT_TITLE,
	PUSH_DEFAULT_BODY,
	PUSH_DONE_BODY,
	payload: attentionPushPayload,
	donePayload: donePushPayload,
	isGone: subscriptionGone,
};
