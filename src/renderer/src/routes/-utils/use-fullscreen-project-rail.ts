import { useCallback, useRef, useState } from "react";

const PROJECT_RAIL_ACTIVATION_WIDTH = 8;
export const PROJECT_RAIL_WITHDRAW_DELAY_MS = 100;

export function useFullscreenProjectRail(
	onRequestShellFocus: () => void,
	options?: { initialFullscreen?: boolean; onFullscreenChange?: (fullscreen: boolean) => void },
) {
	const onFullscreenChange = options?.onFullscreenChange;
	const [fullscreen, setFullscreen] = useState(options?.initialFullscreen ?? false);
	const [revealed, setRevealed] = useState(false);
	const [animating, setAnimating] = useState(false);
	const railRef = useRef<HTMLDivElement | null>(null);
	const withdrawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const edgeArmed = useRef(true);
	const pointerInside = useRef(false);
	const focusInside = useRef(false);
	const pointerFocused = useRef(false);
	const menuOpen = useRef(false);
	const dismissMenu = useRef<(() => void) | null>(null);
	const dragging = useRef(false);
	const pickerActive = useRef(false);
	const modifierHeld = useRef(false);

	const canWithdraw = useCallback(() => {
		return !pointerInside.current
			&& !focusInside.current
			&& !menuOpen.current
			&& !dragging.current
			&& !pickerActive.current
			&& !modifierHeld.current;
	}, []);

	const withdraw = useCallback(() => {
		if (canWithdraw()) {
			setRevealed(false);
		}
	}, [canWithdraw]);

	const cancelWithdraw = useCallback(() => {
		if (!withdrawTimer.current) {
			return;
		}

		clearTimeout(withdrawTimer.current);
		withdrawTimer.current = null;
	}, []);

	const scheduleWithdraw = useCallback(() => {
		cancelWithdraw();
		withdrawTimer.current = setTimeout(() => {
			withdrawTimer.current = null;
			withdraw();
		}, PROJECT_RAIL_WITHDRAW_DELAY_MS);
	}, [cancelWithdraw, withdraw]);

	const reveal = useCallback(() => {
		cancelWithdraw();
		setRevealed(true);
	}, [cancelWithdraw]);

	const toggleFullscreen = useCallback((options?: { animate?: boolean }) => {
		setAnimating(options?.animate !== false && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		if (fullscreen) {
			setRevealed(false);
			setFullscreen(false);
			onFullscreenChange?.(false);
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
		onFullscreenChange?.(true);
	}, [fullscreen, onRequestShellFocus, onFullscreenChange]);
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
		scheduleWithdraw();
	}, [scheduleWithdraw]);

	const handleRailPointerDown = useCallback(() => {
		pointerFocused.current = true;
		focusInside.current = false;
	}, []);

	const handleKeyboardInput = useCallback(() => {
		pointerFocused.current = false;
		focusInside.current = !!railRef.current?.contains(document.activeElement);
	}, []);

	const handleRailFocus = useCallback(() => {
		focusInside.current = !pointerFocused.current;
		reveal();
	}, [reveal]);

	const handleRailBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
		if (event.relatedTarget instanceof Node && railRef.current?.contains(event.relatedTarget)) {
			return;
		}

		focusInside.current = false;
		pointerFocused.current = false;
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

	const setModifierHeld = useCallback((held: boolean) => {
		modifierHeld.current = held;
		if (held) {
			reveal();
			return;
		}

		withdraw();
	}, [reveal, withdraw]);

	const handleWindowBlur = useCallback(() => {
		if (!pickerActive.current) {
			cancelWithdraw();
			pointerInside.current = false;
			focusInside.current = false;
			pointerFocused.current = false;
			setRevealed(false);
		}
	}, [cancelWithdraw]);
	const registerRail = useCallback((rail: HTMLDivElement | null) => {
		railRef.current = rail;
		if (!rail) {
			return;
		}

		const handlePointerMove = (event: PointerEvent) => trackPointer(event.clientX);
		window.addEventListener("pointermove", handlePointerMove, true);
		window.addEventListener("keydown", handleKeyboardInput, true);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			cancelWithdraw();
			railRef.current = null;
			window.removeEventListener("pointermove", handlePointerMove, true);
			window.removeEventListener("keydown", handleKeyboardInput, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [cancelWithdraw, handleKeyboardInput, handleWindowBlur, trackPointer]);

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
		handleRailPointerDown,
		handleRailFocus,
		handleRailBlur,
		setMenuOpen,
		setDragging,
		setPickerActive,
		setModifierHeld,
	};
}
