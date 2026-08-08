import { type FocusEvent, useCallback, useMemo, useRef, useState } from "react";

const TOP_BAND_ACTIVATION_HEIGHT = 8;
const TOP_BAND_HEIGHT = 40;

export function useFocusTopBand(options?: { initialFullscreen?: boolean }) {
	const [revealed, setRevealed] = useState(false);
	const fullscreen = useRef(options?.initialFullscreen ?? false);
	const edgeArmed = useRef(true);
	const focusInside = useRef(false);
	const lastY = useRef(Number.POSITIVE_INFINITY);

	const handleFullscreenChange = useCallback((next: boolean) => {
		fullscreen.current = next;
		edgeArmed.current = false;
		focusInside.current = false;
		setRevealed(false);
	}, []);

	const trackPointer = useCallback((y: number) => {
		lastY.current = y;

		if (!fullscreen.current) {
			return;
		}

		if (y > TOP_BAND_ACTIVATION_HEIGHT) {
			edgeArmed.current = true;
		} else if (edgeArmed.current) {
			setRevealed(true);
		}

		if (y > TOP_BAND_HEIGHT && !focusInside.current) {
			setRevealed(false);
		}
	}, []);

	const handleBandFocus = useCallback(() => {
		focusInside.current = true;

		if (fullscreen.current) {
			setRevealed(true);
		}
	}, []);

	const handleBandBlur = useCallback((event: FocusEvent<HTMLElement>) => {
		if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
			return;
		}

		focusInside.current = false;

		if (fullscreen.current && lastY.current > TOP_BAND_HEIGHT) {
			setRevealed(false);
		}
	}, []);

	const registerBand = useCallback(
		(node: HTMLElement | null) => {
			if (!node) {
				return;
			}

			const handlePointerMove = (event: PointerEvent) => trackPointer(event.clientY);
			const handleWindowBlur = () => {
				focusInside.current = false;
				setRevealed(false);
			};
			window.addEventListener("pointermove", handlePointerMove, true);
			window.addEventListener("blur", handleWindowBlur);
			return () => {
				window.removeEventListener("pointermove", handlePointerMove, true);
				window.removeEventListener("blur", handleWindowBlur);
			};
		},
		[trackPointer],
	);

	const band = useMemo(
		() => ({ revealed, onFocus: handleBandFocus, onBlur: handleBandBlur }),
		[revealed, handleBandFocus, handleBandBlur],
	);

	return { band, handleFullscreenChange, registerBand };
}
