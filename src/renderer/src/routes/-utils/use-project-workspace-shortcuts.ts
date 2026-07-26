import { useCallback } from "react";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useProjectWorkspaceShortcuts({
	active,
	onToggleReview,
}: {
	active: boolean;
	onToggleReview: () => void;
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
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [active, onToggleReview]);
}
