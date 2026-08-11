import { useCallback } from "react";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useBankaiShortcuts({
	onToggleFullscreen,
	onNewShell,
	onArchiveShell,
	onOpenSettings,
	onJumpToRow,
	onJumpToWaiting,
}: {
	onToggleFullscreen: () => void;
	onNewShell: (plain: boolean) => void;
	onArchiveShell: () => void;
	onOpenSettings: () => void;
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
					return () => onNewShell(event.shiftKey);
				}
				if (event.code === "KeyX") {
					return onArchiveShell;
				}
				if (event.code === "Comma") {
					return onOpenSettings;
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
		const handleWindowBlur = () => {
			leaderArmed = false;
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("blur", handleWindowBlur);
		const unsubscribeShortcut = window.bankaiSessionPage?.onShortcut((shortcut) => {
			if (shortcut.action === "toggle-fullscreen") {
				onToggleFullscreen();
			}
			if (shortcut.action === "new-shell") {
				onNewShell(shortcut.plain);
			}
			if (shortcut.action === "archive-shell") {
				onArchiveShell();
			}
			if (shortcut.action === "open-settings") {
				onOpenSettings();
			}
			if (shortcut.action === "jump-waiting") {
				onJumpToWaiting();
			}
			if (shortcut.action === "jump-row") {
				onJumpToRow(shortcut.index);
			}
		});
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("blur", handleWindowBlur);
			unsubscribeShortcut?.();
		};
	}, [onToggleFullscreen, onNewShell, onArchiveShell, onOpenSettings, onJumpToRow, onJumpToWaiting]);
}
