import { useCallback } from "react";
import type { SessionPageShortcut } from "@shared/session-page";
import { useShortcutListener } from "@renderer/routes/-features/app/use-shortcut-listener";

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
	const dispatch = useCallback((shortcut: SessionPageShortcut) => {
		if (shortcut.action === "new-shell") {
			onNewShell(shortcut.plain);

			return true;
		}

		if (shortcut.action === "jump-row") {
			onJumpToRow(shortcut.index);

			return true;
		}

		const actions: Partial<Record<SessionPageShortcut["action"], () => void>> = {
			"toggle-fullscreen": onToggleFullscreen,
			"archive-shell": onArchiveShell,
			"open-settings": onOpenSettings,
			"jump-waiting": onJumpToWaiting,
		};
		const action = actions[shortcut.action];
		if (!action) {
			return false;
		}

		action();

		return true;
	}, [onArchiveShell, onJumpToRow, onJumpToWaiting, onNewShell, onOpenSettings, onToggleFullscreen]);

	return useShortcutListener({ ignoreInputs: true, onShortcut: dispatch });
}
