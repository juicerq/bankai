import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useState } from "react";
import type { Turn } from "@main/review/ReviewModel";
import type { Flag } from "@main/store/flags";
import { orpc } from "@renderer/lib/api";
import type { DiffMode } from "./accumulate";
import { cascadeWarnings } from "./cascade";

type LineRef = { turnId: string; path: string; line: number };
type FlagTarget = { turnId: string; path?: string; line?: number };

type ReviewContextValue = {
	turns: Turn[];
	cwd: string;
	selectedIndex: number;
	selectTurn: (index: number) => void;
	mode: DiffMode;
	setMode: (mode: DiffMode) => void;
	reviewed: Set<string>;
	toggleReviewed: (turnId: string) => void;
	flags: Flag[];
	toggleFlag: (target: FlagTarget) => void;
	selectedLine: LineRef | null;
	selectLine: (line: LineRef) => void;
	cascade: Map<string, number[]>;
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
	const [selectedLine, setSelectedLine] = useState<LineRef | null>(null);
	const [mode, setMode] = useState<DiffMode>("turn");

	const { data: reviewedIds } = useQuery(
		orpc.reviewState.get.queryOptions({ input: { sessionId: props.sessionId } }),
	);
	const reviewed = new Set(reviewedIds);

	const { data: flags } = useQuery(
		orpc.flags.get.queryOptions({ input: { sessionId: props.sessionId } }),
	);
	const activeFlags = flags ?? [];

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

	const { mutate: setFlag } = useMutation(
		orpc.flags.setFlag.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.flags.get.key({
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

	const toggleFlag = (target: FlagTarget) => {
		const active = activeFlags.some(
			(f) =>
				f.turnId === target.turnId &&
				f.path === target.path &&
				f.line === target.line,
		);

		setFlag({ sessionId: props.sessionId, ...target, flagged: !active });
	};

	const cascade = cascadeWarnings(
		props.turns,
		activeFlags.map((f) => f.turnId),
	);

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
				flags: activeFlags,
				toggleFlag,
				selectedLine,
				selectLine: setSelectedLine,
				cascade,
			}}
		>
			{props.children}
		</ReviewContext>
	);
}
