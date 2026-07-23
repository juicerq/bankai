import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useRef,
	useState,
} from "react";

const KEYBOARD_STEP = 8;

interface DividerResolution {
	vars: { property: string; value: number }[];
	commit: () => void;
}

export function useDivider(config: {
	value: number;
	min: number;
	max: number;
	sign: 1 | -1;
	target: RefObject<HTMLElement | null>;
	resolve: (proposed: number) => DividerResolution;
	step?: number;
}) {
	const [resizing, setResizing] = useState(false);
	const drag = useRef<{ x: number; value: number } | null>(null);
	const pending = useRef<DividerResolution | null>(null);
	const step = config.step ?? KEYBOARD_STEP;

	const apply = (resolution: DividerResolution) => {
		for (const entry of resolution.vars) {
			config.target.current?.style.setProperty(entry.property, `${entry.value}px`);
		}
	};

	const commit = (resolution: DividerResolution) => {
		apply(resolution);
		resolution.commit();
		pending.current = null;
		drag.current = null;
		setResizing(false);
	};

	const proposedFrom = (clientX: number) => {
		const start = drag.current;
		if (!start) {
			return null;
		}

		return start.value + config.sign * (clientX - start.x);
	};

	return {
		resizing,
		valueMin: config.min,
		valueMax: config.max,
		valueNow: config.value,
		onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
				return;
			}

			event.preventDefault();
			const resolution = config.resolve(config.value + (event.key === "ArrowRight" ? step : -step) * config.sign);
			apply(resolution);
			resolution.commit();
		},
		pointerProps: {
			onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = { x: event.clientX, value: config.value };
				setResizing(true);
			},
			onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
				const proposed = proposedFrom(event.clientX);
				if (proposed === null) {
					return;
				}

				const resolution = config.resolve(proposed);
				pending.current = resolution;
				apply(resolution);
			},
			onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
				const proposed = proposedFrom(event.clientX);
				commit(proposed === null ? (pending.current ?? config.resolve(config.value)) : config.resolve(proposed));
			},
			onPointerCancel: () => {
				commit(pending.current ?? config.resolve(config.value));
			},
		},
	};
}
