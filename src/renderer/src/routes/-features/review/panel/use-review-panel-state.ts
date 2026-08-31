import { useCallback, useState } from "react";

export type WorkspaceBayMode = "closed" | "review" | "page" | "todos";

interface ReviewPanelSessionState {
	mode: WorkspaceBayMode;
	expanded: boolean;
	restoreMode: WorkspaceBayMode | null;
}

export function useReviewPanelState({
	shellId,
	initialOpen,
	initialExpanded,
	onClose,
}: {
	shellId?: string;
	initialOpen: boolean;
	initialExpanded: boolean;
	onClose: () => void;
}) {
	const initialState = (): ReviewPanelSessionState => ({
		mode: initialOpen ? "review" : "closed",
		expanded: initialExpanded,
		restoreMode: null,
	});
	const [states, setStates] = useState(() => new Map<string | undefined, ReviewPanelSessionState>());
	const state = states.get(shellId) ?? initialState();
	const update = useCallback((nextState: ReviewPanelSessionState) => {
		setStates((current) => new Map(current).set(shellId, nextState));
	}, [shellId]);
	const changeMode = useCallback((nextMode: WorkspaceBayMode) => {
		update({ ...state, mode: nextMode, restoreMode: null });

		if (nextMode === "closed") {
			onClose();
		}
	}, [onClose, state, update]);
	const changeExpanded = useCallback((nextExpanded: boolean) => {
		update({ ...state, expanded: nextExpanded, restoreMode: null });
	}, [state, update]);
	const toggleFocus = useCallback(() => {
		if (state.expanded) {
			const nextMode = state.restoreMode ?? state.mode;
			update({ mode: nextMode, expanded: false, restoreMode: null });

			if (nextMode === "closed") {
				onClose();
			}

			return;
		}

		const nextMode = state.mode === "closed" ? "review" : state.mode;
		update({ mode: nextMode, expanded: true, restoreMode: state.mode });
	}, [onClose, state, update]);

	return {
		mode: state.mode,
		expanded: state.expanded,
		changeMode,
		changeExpanded,
		toggleFocus,
	};
}
