import { type DragEvent, useState } from "react";

export function useDragReorder(
	ids: string[],
	onMove: (data: { id: string; toIndex: number }) => void,
	onDragActiveChange?: (active: boolean) => void,
) {
	const [draggingId, setDraggingId] = useState<string>();
	const [overId, setOverId] = useState<string>();

	const clear = () => {
		setDraggingId(undefined);
		setOverId(undefined);
		onDragActiveChange?.(false);
	};

	return {
		dropEdge: (id: string) => {
			if (!draggingId || overId !== id) {
				return;
			}

			if (ids.indexOf(draggingId) < ids.indexOf(id)) {
				return "after";
			}

			return "before";
		},
		itemProps: (id: string) => ({
			draggable: true,
			onDragStart: (event: DragEvent) => {
				event.dataTransfer.effectAllowed = "move";
				setDraggingId(id);
				onDragActiveChange?.(true);
			},
			onDragOver: (event: DragEvent) => {
				if (!draggingId || draggingId === id) {
					return;
				}

				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setOverId(id);
			},
			onDrop: () => {
				if (draggingId && draggingId !== id) {
					onMove({ id: draggingId, toIndex: ids.indexOf(id) });
				}

				clear();
			},
			onDragEnd: clear,
		}),
	};
}

export type DragReorder = ReturnType<typeof useDragReorder>;
