import { ReviewTransport, setReviewTransport } from "./orpc-transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { BankaiReviewApi, ReviewChangedEvent } from "@shared/review";
import { renderHook } from "./testing-library";
import { type ReviewReading, useReviewReading } from "@renderer/routes/-utils/use-review-reading";

type WatchListener = (event: ReviewChangedEvent) => void;

type PendingWatch = { projectId: string; resolve: () => void; reject: (error: unknown) => void };

class ReviewIpc {
	readonly events: ("listen" | "watch")[] = [];
	readonly watchCalls: string[] = [];
	readonly unwatchCalls: string[] = [];
	private readonly listeners = new Set<WatchListener>();
	private readonly pendingWatch: PendingWatch[] = [];

	readonly api: BankaiReviewApi = {
		watch: (projectId) => {
			this.events.push("watch");
			this.watchCalls.push(projectId);
			return new Promise<void>((resolve, reject) => {
				this.pendingWatch.push({ projectId, resolve, reject });
			});
		},
		unwatch: (projectId) => {
			this.unwatchCalls.push(projectId);
		},
		onChanged: (listener) => {
			this.events.push("listen");
			this.listeners.add(listener);
			return () => {
				this.listeners.delete(listener);
			};
		},
	};

	get listenerCount() {
		return this.listeners.size;
	}

	get pendingWatchCount() {
		return this.pendingWatch.length;
	}

	emitChange(projectId: string) {
		for (const listener of this.listeners) {
			listener({ projectId });
		}
	}

	resolveWatch(projectId?: string) {
		this.takeWatch(projectId).resolve();
	}

	rejectWatch(error: unknown, projectId?: string) {
		this.takeWatch(projectId).reject(error);
	}

	private takeWatch(projectId?: string) {
		const index = this.pendingWatch.findIndex((watch) => !projectId || watch.projectId === projectId);
		if (index === -1) {
			throw new Error("No pending watch request");
		}

		const [watch] = this.pendingWatch.splice(index, 1);
		if (!watch) {
			throw new Error("No pending watch request");
		}

		return watch;
	}
}

export type ReviewReadingProps = Parameters<typeof useReviewReading>[0];

export function renderReviewReading(initialProps: ReviewReadingProps) {
	const ipc = new ReviewIpc();
	window.bankaiReview = ipc.api;

	const transport = new ReviewTransport();
	setReviewTransport(transport);

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);

	const renders: ReviewReading[] = [];
	const view = renderHook(
		(props: ReviewReadingProps) => {
			const reading = useReviewReading(props);
			renders.push(reading);
			return reading;
		},
		{ initialProps, wrapper },
	);

	return { ...view, ipc, transport, queryClient, renders };
}
