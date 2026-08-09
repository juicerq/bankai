import { ReviewTransport, setReviewTransport } from "./orpc-transport";
import { streamTransport } from "./stream-transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { streamSocket } from "@renderer/lib/stream/socket";
import type { ReviewWatchInput } from "@shared/review";
import { renderHook } from "./testing-library";
import { type ReviewReading, useReviewReading } from "@renderer/routes/-features/review/reading/use-review-reading";

interface PendingWatch {
	input: ReviewWatchInput;
	resolve: () => void;
	reject: (error: unknown) => void;
}

class ReviewIpc {
	private readonly since = streamTransport.calls.length;
	private readonly pendingWatch: PendingWatch[] = [];

	get watchCalls() {
		return this.sent("watch");
	}

	get unwatchCalls() {
		return this.sent("unwatch");
	}

	get pendingWatchCount() {
		return this.pendingWatch.length;
	}

	queueWatch(input: ReviewWatchInput) {
		return new Promise<void>((resolve, reject) => {
			this.pendingWatch.push({ input, resolve, reject });
		});
	}

	emitChange(projectId: string) {
		streamTransport.push("review", "changed", { projectId });
	}

	resolveWatch(projectId?: string) {
		this.takeWatch(projectId).resolve();
	}

	rejectWatch(error: unknown, projectId?: string) {
		this.takeWatch(projectId).reject(error);
	}

	private sent(type: string) {
		return streamTransport.calls
			.slice(this.since)
			.filter((call) => call.channel === "review" && call.type === type)
			.map((call) => call.payload);
	}

	private takeWatch(projectId?: string) {
		const index = this.pendingWatch.findIndex((watch) => !projectId || watch.input.projectId === projectId);
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

let current = new ReviewIpc();

const HANDSHAKE = "harness-handshake";

streamTransport.handle("review", "watch", (input: ReviewWatchInput) => current.queueWatch(input));
streamTransport.handle("review", HANDSHAKE, () => {});

await streamSocket.request("review", HANDSHAKE);

export type ReviewReadingProps = Parameters<typeof useReviewReading>[0];

export function installReviewEnvironment() {
	const ipc = new ReviewIpc();
	current = ipc;

	const transport = new ReviewTransport();
	setReviewTransport(transport);

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
	});
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: queryClient }, children);

	return { ipc, transport, queryClient, wrapper };
}

export function renderReviewReading(initialProps: ReviewReadingProps) {
	const { ipc, transport, queryClient, wrapper } = installReviewEnvironment();

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
