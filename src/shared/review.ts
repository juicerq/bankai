export const REVIEW_CHANGED = "review:changed";

export type ReviewChanged = { sessionId: string };

export type ReviewBridge = {
	onChanged(cb: (sessionId: string) => void): () => void;
};
