import { type PointerEvent, useRef } from "react";

export const LONG_PRESS_MS = 450;

const DRIFT_PX = 10;

export function useLongPress(onHold: () => void) {
	const press = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number }>({ x: 0, y: 0 });
	const held = useRef(false);

	const stop = () => {
		if (press.current.timer) {
			clearTimeout(press.current.timer);
			press.current.timer = undefined;
		}
	};

	return {
		held: () => held.current,
		press: {
			onPointerDown: (event: PointerEvent) => {
				stop();
				held.current = false;
				press.current = {
					x: event.clientX,
					y: event.clientY,
					timer: setTimeout(() => {
						press.current.timer = undefined;
						held.current = true;
						navigator.vibrate?.(10);
						onHold();
					}, LONG_PRESS_MS),
				};
			},
			onPointerMove: (event: PointerEvent) => {
				const from = press.current;

				if (Math.abs(event.clientX - from.x) > DRIFT_PX || Math.abs(event.clientY - from.y) > DRIFT_PX) {
					stop();
				}
			},
			onPointerUp: stop,
			onPointerCancel: stop,
			onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
		},
	};
}
