import { useCallback } from "react";

export function useMenuDismissal(close: () => void) {
	return useCallback(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
			}
		};

		window.addEventListener("pointerdown", close);
		window.addEventListener("blur", close);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("pointerdown", close);
			window.removeEventListener("blur", close);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [close]);
}
