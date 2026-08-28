import { useCallback } from "react";
import type { SessionPageShortcut } from "@shared/session-page";
import { ShortcutInterpreter } from "@shared/shortcuts";

export function useShortcutListener({
	active = true,
	ignoreInputs = false,
	onShortcut,
}: {
	active?: boolean;
	ignoreInputs?: boolean;
	onShortcut: (shortcut: SessionPageShortcut) => boolean;
}) {
	return useCallback(() => {
		const interpreter = new ShortcutInterpreter();
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!active || (ignoreInputs && event.target instanceof HTMLInputElement)) {
				return;
			}

			const interpreted = interpreter.accept({
				type: "keyDown",
				key: event.key,
				code: event.code,
				control: event.ctrlKey,
				alt: event.altKey,
				meta: event.metaKey,
				shift: event.shiftKey,
			});
			const handled = interpreted?.kind === "leader"
				|| (interpreted?.kind === "shortcut" && onShortcut(interpreted.shortcut));

			if (!handled) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
		};
		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("blur", interpreter.reset);
		const unsubscribe = window.bankaiSessionPage?.onShortcut((shortcut) => {
			if (active) {
				onShortcut(shortcut);
			}
		});

		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("blur", interpreter.reset);
			unsubscribe?.();
		};
	}, [active, ignoreInputs, onShortcut]);
}
