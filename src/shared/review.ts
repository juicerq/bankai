export interface ReviewChangedEvent { projectId: string }

export interface ReviewWatchInput { projectId: string; worktree?: string }

export interface BankaiReviewApi {
	watch: (input: ReviewWatchInput) => Promise<void>;
	unwatch: (input: ReviewWatchInput) => void;
	onChanged: (listener: (event: ReviewChangedEvent) => void) => () => void;
}