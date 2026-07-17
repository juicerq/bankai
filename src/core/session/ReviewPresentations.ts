import { sessionKey, type SessionRef } from "@core/harness/registry";
import type { TranscriptProjector } from "@core/review/TranscriptProjector";
import type { Turn } from "@core/review/ReviewModel";
import { canReviewTurn } from "@core/review/unreviewed";
import { ReviewState } from "@core/store/review-state";

export type ReviewPresentation = {
	turns: Turn[];
	reviewedTurnIds: string[];
	availability: "loading" | "available" | "unavailable";
};

export type InitialReview = {
	session: SessionRef;
	turns: Turn[];
	reviewed: string[];
	available: boolean;
};

const EMPTY_PRESENTATION: ReviewPresentation = {
	turns: [],
	reviewedTurnIds: [],
	availability: "loading",
};

export class ReviewPresentations {
	private readonly queues = new Map<string, Promise<void>>();
	private current: Record<string, ReviewPresentation>;

	constructor(
		private readonly projector: TranscriptProjector,
		initial: InitialReview | null,
		private readonly onChange: (presentations: Record<string, ReviewPresentation>) => void,
	) {
		this.current = initial ? {
			[sessionKey(initial.session)]: {
				turns: initial.turns,
				reviewedTurnIds: initial.reviewed,
				availability: initial.available ? "available" : "unavailable",
			},
		} : {};
	}

	snapshot(): Record<string, ReviewPresentation> {
		return this.current;
	}

	get(session: SessionRef | null): ReviewPresentation {
		if (!session) {
			return { ...EMPTY_PRESENTATION, availability: "available" };
		}
		return this.current[sessionKey(session)] ?? EMPTY_PRESENTATION;
	}

	setLoading(session: SessionRef): void {
		const key = sessionKey(session);
		this.update({
			...this.current,
			[key]: {
				...(this.current[key] ?? EMPTY_PRESENTATION),
				availability: "loading",
			},
		});
	}

	async toggle(session: SessionRef, turnId: string): Promise<void> {
		await this.enqueue(session, async (key) => {
			const presentation = this.get(session);
			if (!canReviewTurn(presentation.turns, turnId)) {
				return;
			}

			const reviewedTurnIds = await ReviewState.toggle(session, turnId);
			this.update({
				...this.current,
				[key]: { ...presentation, reviewedTurnIds },
			});
		});
	}

	async refresh(session: SessionRef): Promise<void> {
		await this.enqueue(session, async (key) => {
			const [reviewedTurnIds, turns, available] = await Promise.all([
				ReviewState.get(session),
				this.projector.turns(session),
				this.projector.available(session),
			]);

			this.update({
				...this.current,
				[key]: {
					reviewedTurnIds,
					turns,
					availability: available ? "available" : "unavailable",
				},
			});
		});
	}

	private async enqueue(
		session: SessionRef,
		operation: (key: string) => Promise<void>,
	): Promise<void> {
		const key = sessionKey(session);
		const previous = this.queues.get(key) ?? Promise.resolve();
		const next = previous.catch(() => {}).then(() => operation(key));

		this.queues.set(key, next);
		await next;
		if (this.queues.get(key) === next) {
			this.queues.delete(key);
		}
	}

	private update(presentations: Record<string, ReviewPresentation>): void {
		this.current = presentations;
		this.onChange(presentations);
	}
}
