import type { SessionRef } from "@core/harness/registry";
import { Logger } from "@core/logger";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import { countUnreviewed } from "@core/review/unreviewed";
import {
	type InitialReview,
	type ReviewPresentation,
	ReviewPresentations,
} from "@core/session/ReviewPresentations";
import {
	type TabCapture,
	TabSessionMonitor,
} from "@core/session/TabSessionMonitor";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";

const POLL_MS = 2000;

export type SessionTabStatus = {
	status: "active" | "idle";
	unreviewed: boolean;
};

export type SessionReviewsSnapshot = {
	captures: Record<string, TabCapture>;
	presentations: Record<string, ReviewPresentation>;
};

export class SessionReviews {
	private readonly monitor: TabSessionMonitor;
	private readonly projector = new TranscriptProjector();
	private readonly presentations: ReviewPresentations;
	private readonly listeners = new Set<() => void>();
	private stopLifecycle: (() => void) | null = null;
	private current: SessionReviewsSnapshot;

	constructor(
		private readonly supervisor: TabSupervisor,
		initialCaptures: Record<string, TabCapture>,
		initialReview: InitialReview | null,
	) {
		this.monitor = new TabSessionMonitor(initialCaptures);
		this.presentations = new ReviewPresentations(
			this.projector,
			initialReview,
			(presentations) => this.update({ ...this.current, presentations }),
		);
		this.current = {
			captures: initialCaptures,
			presentations: this.presentations.snapshot(),
		};
	}

	snapshot = (): SessionReviewsSnapshot => this.current;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	start(): () => void {
		this.stopLifecycle?.();
		const stopProjector = this.projector.onChange((session) => {
			this.presentations.refresh(session)
				.catch((err) => Logger.error("review:presentation-read-failed", String(err)));
		});
		const poll = () => {
			this.poll().catch((err) => Logger.error("session:bind-failed", String(err)));
		};
		poll();
		const interval = setInterval(poll, POLL_MS);
		const stop = () => {
			clearInterval(interval);
			stopProjector();
			if (this.stopLifecycle === stop) {
				this.stopLifecycle = null;
			}
		};
		this.stopLifecycle = stop;
		return stop;
	}

	dispose(): void {
		this.stopLifecycle?.();
		this.listeners.clear();
	}

	presentation(session: SessionRef | null): ReviewPresentation {
		return this.presentations.get(session);
	}

	tabStatuses(tabIds: string[]): Record<string, SessionTabStatus> {
		const statuses: Record<string, SessionTabStatus> = {};
		for (const tabId of tabIds) {
			const capture = this.current.captures[tabId];
			if (capture?.state !== "bound") {
				continue;
			}

			const review = this.presentations.get(capture.session);
			statuses[tabId] = {
				status: this.projector.status(capture.session, capture.running !== undefined),
				unreviewed: countUnreviewed(review.turns, review.reviewedTurnIds) > 0,
			};
		}
		return statuses;
	}

	async load(session: SessionRef, alive: boolean): Promise<void> {
		this.presentations.setLoading(session);
		await this.projector.refresh(session, alive);
		await this.presentations.refresh(session);
	}

	async toggle(session: SessionRef, turnId: string): Promise<void> {
		await this.presentations.toggle(session, turnId);
	}

	async poll(): Promise<void> {
		const result = await this.monitor.poll(this.supervisor.pids());
		if (result.captures !== this.current.captures) {
			this.update({ ...this.current, captures: result.captures });
		}

		await Promise.all(result.observations.map((observation) =>
			this.projector.refresh(observation.session, observation.alive)));
	}

	private update(snapshot: SessionReviewsSnapshot): void {
		this.current = snapshot;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
