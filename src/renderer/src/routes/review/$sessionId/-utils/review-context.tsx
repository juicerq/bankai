import { createContext, type ReactNode, use, useState } from "react";
import type { Turn } from "@main/review/ReviewModel";
import type { DiffMode } from "./accumulate";

type ReviewContextValue = {
	turns: Turn[];
	cwd: string;
	selectedIndex: number;
	selectTurn: (index: number) => void;
	mode: DiffMode;
	setMode: (mode: DiffMode) => void;
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
	turns: Turn[];
	cwd: string;
	children: ReactNode;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [mode, setMode] = useState<DiffMode>("turn");

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
			}}
		>
			{props.children}
		</ReviewContext>
	);
}
