import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useState } from "react";
import type { Turn } from "@main/review/ReviewModel";
import { orpc } from "@renderer/lib/api";
import type { DiffMode } from "./accumulate";

type ReviewContextValue = {
	turns: Turn[];
	cwd: string;
	selectedIndex: number;
	selectTurn: (index: number) => void;
	mode: DiffMode;
	setMode: (mode: DiffMode) => void;
	reviewed: Set<string>;
	toggleReviewed: (turnId: string) => void;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview() {
	const ctx = use(ReviewContext);

	if (!ctx) {
		throw new Error("useReview must be used within ReviewProvider");
	}

	return ctx;
}

export function ReviewProvider(props: {
	sessionId: string;
	turns: Turn[];
	cwd: string;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [mode, setMode] = useState<DiffMode>("turn");

	const { data: reviewedIds } = useQuery(
		orpc.reviewState.get.queryOptions({ input: { sessionId: props.sessionId } }),
	);
	const reviewed = new Set(reviewedIds);

	const { mutate: setReviewed } = useMutation(
		orpc.reviewState.setReviewed.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.reviewState.get.key({
						input: { sessionId: props.sessionId },
					}),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.review.unreviewedCount.key({
						input: { sessionId: props.sessionId },
					}),
				});
			},
		}),
	);

	const toggleReviewed = (turnId: string) => {
		setReviewed({
			sessionId: props.sessionId,
			turnId,
			reviewed: !reviewed.has(turnId),
		});
	};

	const foundIndex = props.turns.findIndex((t) => t.turnId === selectedId);
	const selectedIndex = foundIndex === -1 ? props.turns.length - 1 : foundIndex;

	const selectTurn = (index: number) => {
		const turn = props.turns[index];

		if (turn) {
			setSelectedId(turn.turnId);
		}
	};

	return (
		<ReviewContext
			value={{
				turns: props.turns,
				cwd: props.cwd,
				selectedIndex,
				selectTurn,
				mode,
				setMode,
				reviewed,
				toggleReviewed,
			}}
		>
			{props.children}
		</ReviewContext>
	);
}
