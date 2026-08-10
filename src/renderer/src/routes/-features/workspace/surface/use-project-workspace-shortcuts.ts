import { useCallback } from "react";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useProjectWorkspaceShortcuts({
	active,
	onToggleReview,
	onToggleReviewExpanded,
	onOpenCommands,
	onOpenQuickOpen,
}: {
	active: boolean;
	onToggleReview: () => void;
	onToggleReviewExpanded: () => void;
	onOpenCommands: () => void;
	onOpenQuickOpen: () => void;
}) {
	return useCallback(() => {
		let leaderArmed = false;

		const shortcutAction = (event: KeyboardEvent) => {
			if (!active) {
				return;
			}

			if (leaderArmed) {
				leaderArmed = false;
				if (event.code === "KeyR") {
					return onToggleReview;
				}

				if (event.code === "KeyE") {
					return onToggleReviewExpanded;
				}

				if (event.code === "KeyC") {
					return onOpenCommands;
				}

				if (event.code === "KeyP") {
					return onOpenQuickOpen;
				}

				return;
			}

			if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "KeyX") {
				return () => {
					leaderArmed = true;
				};
			}

			return;
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (MODIFIER_KEYS.has(event.key)) {
				return;
			}

			const action = shortcutAction(event);
			if (!action) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			action();
		};
		const handleWindowBlur = () => {
			leaderArmed = false;
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("blur", handleWindowBlur);
		const unsubscribeShortcut = window.bankaiSessionPage?.onShortcut((shortcut) => {
			if (!active) {
				return;
			}

			if (shortcut.action === "toggle-review") {
				onToggleReview();
			}
			if (shortcut.action === "toggle-expanded") {
				onToggleReviewExpanded();
			}
			if (shortcut.action === "open-commands") {
				onOpenCommands();
			}
			if (shortcut.action === "open-quick-open") {
				onOpenQuickOpen();
			}
		});
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("blur", handleWindowBlur);
			unsubscribeShortcut?.();
		};
	}, [active, onOpenCommands, onOpenQuickOpen, onToggleReview, onToggleReviewExpanded]);
}
