import { useCallback } from "react";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useBankaiShortcuts({
	onToggleFullscreen,
	onNewShell,
	onCloseShell,
	onModifierHold,
	onJumpToRow,
	onJumpToWaiting,
}: {
	onToggleFullscreen: () => void;
	onNewShell: () => void;
	onCloseShell: () => void;
	onModifierHold: (held: boolean) => void;
	onJumpToRow: (index: number) => void;
	onJumpToWaiting: () => void;
}) {
	return useCallback(() => {
		let leaderArmed = false;

		const shortcutAction = (event: KeyboardEvent) => {
			if (leaderArmed) {
				leaderArmed = false;
				if (event.code === "KeyF") {
					return onToggleFullscreen;
				}
				if (event.code === "KeyT") {
					return onNewShell;
				}
				if (event.code === "KeyX") {
					return onCloseShell;
				}

				return;
			}

			if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
				const index = Number(event.code.slice(5)) - 1;
				return () => onJumpToRow(index);
			}

			if (!event.ctrlKey || event.altKey || event.metaKey) {
				return;
			}

			if (event.code === "Tab") {
				return onJumpToWaiting;
			}

			if (event.code === "KeyX") {
				return () => {
					leaderArmed = true;
				};
			}

			return;
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Alt") {
				onModifierHold(true);
				return;
			}

			if (MODIFIER_KEYS.has(event.key) || event.target instanceof HTMLInputElement) {
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
		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key === "Alt") {
				onModifierHold(false);
			}
		};
		const handleWindowBlur = () => {
			leaderArmed = false;
			onModifierHold(false);
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("keyup", handleKeyUp, true);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("keyup", handleKeyUp, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [onToggleFullscreen, onNewShell, onCloseShell, onModifierHold, onJumpToRow, onJumpToWaiting]);
}
