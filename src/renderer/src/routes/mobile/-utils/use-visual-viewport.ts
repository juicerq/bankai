import { useCallback } from "react";

export function useVisualViewport() {
	return useCallback((element: HTMLElement | null) => {
		const viewport = window.visualViewport;
		if (!element || !viewport) {
			return;
		}

		const apply = () => {
			element.style.height = `${viewport.height}px`;
			element.style.transform = `translateY(${viewport.offsetTop}px)`;
		};

		apply();
		viewport.addEventListener("resize", apply);
		viewport.addEventListener("scroll", apply);
		window.addEventListener("pageshow", apply);

		return () => {
			viewport.removeEventListener("resize", apply);
			viewport.removeEventListener("scroll", apply);
			window.removeEventListener("pageshow", apply);
		};
	}, []);
}
