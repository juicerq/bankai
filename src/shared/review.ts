export const REVIEW_IPC = {
	watch: "review:watch",
	unwatch: "review:unwatch",
	changed: "review:changed",
} as const;

export type ReviewChangedEvent = { projectId: string };

export interface BankaiReviewApi {
	watch: (projectId: string) => Promise<void>;
	unwatch: (projectId: string) => void;
	onChanged: (listener: (event: ReviewChangedEvent) => void) => () => void;
}

declare global {
	interface Window {
		bankaiReview: BankaiReviewApi;
	}
}
