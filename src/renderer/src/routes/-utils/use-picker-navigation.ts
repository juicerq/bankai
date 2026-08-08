import { type KeyboardEvent as ReactKeyboardEvent, useState } from "react";

export function usePickerNavigation<Item>(config: {
	items: Item[];
	key: (item: Item) => string;
	fallback?: (items: Item[]) => Item | undefined;
	onChoose: (highlighted: Item | undefined, event: ReactKeyboardEvent<HTMLElement>) => void;
	onClose: () => void;
}) {
	const [highlightedKey, setHighlightedKey] = useState<string>();
	const items = config.items;
	const highlighted = items.find((item) => config.key(item) === highlightedKey) ?? config.fallback?.(items);
	const positions = items.length + (config.fallback ? 0 : 1);

	const move = (step: number) => {
		if (positions === 0) {
			return;
		}

		const current = items.findIndex((item) => item === highlighted);
		const position = current < 0 ? items.length : current;
		const next = items[(position + step + positions) % positions];

		setHighlightedKey(next ? config.key(next) : undefined);
	};

	return {
		highlighted,
		highlightedKey: highlighted ? config.key(highlighted) : undefined,
		clear: () => setHighlightedKey(undefined),
		onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
			if (event.key === "Escape") {
				config.onClose();
				return;
			}

			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				move(event.key === "ArrowDown" ? 1 : -1);
				return;
			}

			if (event.key !== "Enter") {
				return;
			}

			event.preventDefault();
			config.onChoose(highlighted, event);
		},
		itemProps: (item: Item) => ({
			highlighted: item === highlighted,
			onMouseMove: () => setHighlightedKey(config.key(item)),
			// The highlight moves by keyboard, so the list has to follow it: only the DOM knows
			// whether the highlighted row is still inside the scrollport.
			ref:
				item === highlighted
					? (element: HTMLElement | null) => {
							element?.scrollIntoView({ block: "nearest" });
						}
					: undefined,
		}),
	};
}
