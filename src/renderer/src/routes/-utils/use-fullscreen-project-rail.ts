import { useCallback, useRef, useState } from "react";

const PROJECT_RAIL_ACTIVATION_WIDTH = 8;

export function useFullscreenProjectRail(onRequestShellFocus: () => void) {
	const [fullscreen, setFullscreen] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [animating, setAnimating] = useState(false);
	const railRef = useRef<HTMLDivElement | null>(null);
	const edgeArmed = useRef(true);
	const pointerInside = useRef(false);
	const focusInside = useRef(false);
	const menuOpen = useRef(false);
	const dismissMenu = useRef<(() => void) | null>(null);
	const dragging = useRef(false);
	const pickerActive = useRef(false);

	const canWithdraw = useCallback(() => {
		return !pointerInside.current
			&& !focusInside.current
			&& !menuOpen.current
			&& !dragging.current
			&& !pickerActive.current;
	}, []);

	const withdraw = useCallback(() => {
		if (canWithdraw()) {
			setRevealed(false);
		}
	}, [canWithdraw]);

	const reveal = useCallback(() => {
		setRevealed(true);
	}, []);

	const toggleFullscreen = useCallback(() => {
		setAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		if (fullscreen) {
			setRevealed(false);
			setFullscreen(false);
			return;
		}

		edgeArmed.current = false;
		setRevealed(false);
		if (
			focusInside.current
			|| menuOpen.current
			|| (document.activeElement && railRef.current?.contains(document.activeElement))
		) {
			onRequestShellFocus();
		}
		pointerInside.current = false;
		focusInside.current = false;
		dismissMenu.current?.();
		dismissMenu.current = null;
		menuOpen.current = false;
		setFullscreen(true);
	}, [fullscreen, onRequestShellFocus]);
	const finishMotion = useCallback(() => setAnimating(false), []);

	const trackPointer = useCallback((x: number) => {
		if (x > PROJECT_RAIL_ACTIVATION_WIDTH) {
			edgeArmed.current = true;
		}
	}, []);

	const handleEdgeEnter = useCallback(() => {
		if (!edgeArmed.current) {
			return;
		}

		reveal();
	}, [reveal]);

	const handleRailPointerEnter = useCallback(() => {
		pointerInside.current = true;
		reveal();
	}, [reveal]);

	const handleRailPointerLeave = useCallback(() => {
		pointerInside.current = false;
		withdraw();
	}, [withdraw]);

	const handleRailFocus = useCallback(() => {
		focusInside.current = true;
		reveal();
	}, [reveal]);

	const handleRailBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
		if (event.relatedTarget instanceof Node && railRef.current?.contains(event.relatedTarget)) {
			return;
		}

		focusInside.current = false;
		withdraw();
	}, [withdraw]);

	const setMenuOpen = useCallback((open: boolean, dismiss?: () => void) => {
		menuOpen.current = open;
		dismissMenu.current = dismiss || null;
		if (open) {
			reveal();
			return;
		}

		withdraw();
	}, [reveal, withdraw]);

	const setDragging = useCallback((active: boolean) => {
		dragging.current = active;
		if (active) {
			reveal();
			return;
		}

		withdraw();
	}, [reveal, withdraw]);

	const setPickerActive = useCallback((active: boolean) => {
		pickerActive.current = active;
		if (active) {
			reveal();
			return;
		}

		withdraw();
	}, [reveal, withdraw]);

	const handleWindowBlur = useCallback(() => {
		if (!pickerActive.current) {
			pointerInside.current = false;
			focusInside.current = false;
			setRevealed(false);
		}
	}, []);
	const registerRail = useCallback((rail: HTMLDivElement | null) => {
		railRef.current = rail;
		if (!rail) {
			return;
		}

		const handlePointerMove = (event: PointerEvent) => trackPointer(event.clientX);
		window.addEventListener("pointermove", handlePointerMove, true);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			railRef.current = null;
			window.removeEventListener("pointermove", handlePointerMove, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [handleWindowBlur, trackPointer]);

	return {
		fullscreen,
		revealed,
		animating,
		toggleFullscreen,
		finishMotion,
		registerRail,
		handleEdgeEnter,
		handleRailPointerEnter,
		handleRailPointerLeave,
		handleRailFocus,
		handleRailBlur,
		setMenuOpen,
		setDragging,
		setPickerActive,
	};
}
