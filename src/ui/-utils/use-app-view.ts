import { useReducer } from "react";
import type { SessionRef } from "@core/harness/registry";
import type { RestorePlan } from "@core/workspace/planRestore";

type AppViewState = {
	focus: "sidebar" | "terminal" | "panel";
	screen: { kind: "command" } | { kind: "review"; session: SessionRef | null };
	leader: boolean;
	resize: boolean;
	zen: RestorePlan["zen"];
};

type AppViewAction =
	| { type: "focus"; target: AppViewState["focus"] }
	| { type: "leader"; active: boolean }
	| { type: "resize"; active: boolean }
	| { type: "review"; session: SessionRef | null }
	| { type: "close-review" }
	| { type: "toggle-zen" };

function reduceAppView(state: AppViewState, action: AppViewAction): AppViewState {
	switch (action.type) {
		case "focus":
			return { ...state, focus: action.target };
		case "leader":
			return { ...state, leader: action.active };
		case "resize":
			return { ...state, resize: action.active };
		case "review":
			return {
				...state,
				leader: false,
				screen: { kind: "review", session: action.session },
			};
		case "close-review":
			return { ...state, screen: { kind: "command" } };
		case "toggle-zen":
			return {
				...state,
				zen: {
					...state.zen,
					[state.screen.kind]: !state.zen[state.screen.kind],
				},
			};
	}
}

export function useAppView(plan: RestorePlan) {
	const [view, dispatch] = useReducer(reduceAppView, {
		focus: plan.focus,
		screen: plan.screen === "review"
			? { kind: "review", session: plan.reviewSession }
			: { kind: "command" },
		leader: false,
		resize: false,
		zen: plan.zen,
	});

	return {
		view,
		focus(target: AppViewState["focus"]) {
			dispatch({ type: "focus", target });
		},
		setLeader(active: boolean) {
			dispatch({ type: "leader", active });
		},
		setResize(active: boolean) {
			dispatch({ type: "resize", active });
		},
		openReview(session: SessionRef | null) {
			dispatch({ type: "review", session });
		},
		closeReview() {
			dispatch({ type: "close-review" });
		},
		toggleZen() {
			dispatch({ type: "toggle-zen" });
		},
	};
}
