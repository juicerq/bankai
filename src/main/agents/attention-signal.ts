import type { ActivityAttentionEvent } from "@shared/activity";

export const ATTENTION_RETAINED_MAX = 20;

type AttentionListener = (event: ActivityAttentionEvent) => void;

const listeners = new Set<AttentionListener>();
const retained: ActivityAttentionEvent[] = [];

function raiseAttention(event: ActivityAttentionEvent): void {
	if (listeners.size === 0) {
		retained.push(event);
		retained.splice(0, retained.length - ATTENTION_RETAINED_MAX);

		return;
	}

	for (const listener of listeners) {
		listener(event);
	}
}

function listenAttention(listener: AttentionListener): () => void {
	listeners.add(listener);

	for (const event of retained.splice(0)) {
		listener(event);
	}

	return () => {
		listeners.delete(listener);
	};
}

export const AttentionSignal = {
	raise: raiseAttention,
	listen: listenAttention,
};
