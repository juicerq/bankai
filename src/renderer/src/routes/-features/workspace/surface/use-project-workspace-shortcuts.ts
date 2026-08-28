import { useCallback } from "react";
import type { SessionPageShortcut } from "@shared/session-page";
import { useShortcutListener } from "@renderer/routes/-features/app/use-shortcut-listener";

export function useProjectWorkspaceShortcuts({
	active,
	onToggleReview,
	onToggleReviewExpanded,
	onTogglePage,
	onToggleTodos,
	onOpenCommands,
	onOpenQuickOpen,
}: {
	active: boolean;
	onToggleReview: () => void;
	onToggleReviewExpanded: () => void;
	onTogglePage: () => void;
	onToggleTodos: () => void;
	onOpenCommands: () => void;
	onOpenQuickOpen: () => void;
}) {
	const dispatch = useCallback((shortcut: SessionPageShortcut) => {
		const actions: Partial<Record<SessionPageShortcut["action"], () => void>> = {
			"toggle-review": onToggleReview,
			"toggle-expanded": onToggleReviewExpanded,
			"toggle-page": onTogglePage,
			"toggle-todos": onToggleTodos,
			"open-commands": onOpenCommands,
			"open-quick-open": onOpenQuickOpen,
		};
		const action = actions[shortcut.action];
		if (!action) {
			return false;
		}

		action();

		return true;
	}, [onOpenCommands, onOpenQuickOpen, onTogglePage, onToggleReview, onToggleReviewExpanded, onToggleTodos]);

	return useShortcutListener({ active, onShortcut: dispatch });
}
