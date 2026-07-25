export const REVIEW_IPC = {
	watch: "review:watch",
	unwatch: "review:unwatch",
	changed: "review:changed",
} as const;

export interface ReviewChangedEvent { projectId: string }

export interface ReviewWatchInput { projectId: string; worktree?: string }

export interface BankaiReviewApi {
	watch: (input: ReviewWatchInput) => Promise<void>;
	unwatch: (input: ReviewWatchInput) => void;
	onChanged: (listener: (event: ReviewChangedEvent) => void) => () => void;
}

declare global {
	interface Window {
		bankaiReview: BankaiReviewApi;
	}
}
