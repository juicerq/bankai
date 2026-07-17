import { useLayoutEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";

export function useScrollSelection(
	selectedId: string | null | undefined,
	position: number,
) {
	const scroll = useRef<ScrollBoxRenderable>(null);

	useLayoutEffect(() => {
		if (selectedId) {
			scroll.current?.scrollChildIntoView(selectedId);
		}
	}, [position, selectedId]);

	return scroll;
}
