import { type RefObject, useCallback } from "react";

export function useMenuDismissal(close: () => void, keep?: RefObject<HTMLElement | null>) {
	return useCallback((menu: HTMLElement | null) => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
			}
		};

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (target instanceof Node && (menu?.contains(target) || keep?.current?.contains(target))) {
				return;
			}

			close();
		};

		window.addEventListener("pointerdown", handlePointerDown, true);
		window.addEventListener("blur", close);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("pointerdown", handlePointerDown, true);
			window.removeEventListener("blur", close);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [close, keep]);
}
