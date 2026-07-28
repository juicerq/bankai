import { useCallback, useRef, useState } from "react";
import type { LayoutSettings } from "@main/store/settings";
import {
	MIN_DIFF_WIDTH,
	MIN_TERMINAL_WIDTH,
	MIN_TREE_WIDTH,
	REVIEW_DIFF_WIDTH_PROPERTY,
	REVIEW_DIFF_WIDTH_VALUE,
	REVIEW_SEPARATOR_WIDTH,
	REVIEW_TREE_WIDTH_PROPERTY,
	REVIEW_TREE_WIDTH_VALUE,
	expandReviewDiff,
	redistributeReviewTree,
	squeezeReviewDiff,
} from "@renderer/routes/-utils/review-layout";
import { useDivider } from "@renderer/routes/-utils/use-divider";

export function useReviewGeometry({
	initialDiffWidth,
	initialTreeWidth,
	treeOpen,
	expanded,
	onPersistLayout,
}: {
	initialDiffWidth: number;
	initialTreeWidth: number;
	treeOpen: boolean;
	expanded: boolean;
	onPersistLayout: (patch: LayoutSettings) => void;
}) {
	const [diffWidth, setDiffWidth] = useState(initialDiffWidth);
	const [treeWidth, setTreeWidth] = useState(initialTreeWidth);
	const [rowWidth, setRowWidth] = useState<number>();
	const rowElement = useRef<HTMLDivElement | null>(null);

	const treeReserve = treeOpen ? treeWidth : 0;
	const maxDiffWidth = rowWidth === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(MIN_DIFF_WIDTH, rowWidth - MIN_TERMINAL_WIDTH - treeReserve);
	// The docked pair is what the row reserves, expanded or not: the panel lays
	// itself over the shells, so growing it must never cost the terminal columns.
	const dockedDiffWidth = Math.min(Math.max(diffWidth, MIN_DIFF_WIDTH), maxDiffWidth);
	const fitTree = (reserved: number) =>
		rowWidth === undefined ? treeWidth : Math.min(treeWidth, Math.max(MIN_TREE_WIDTH, rowWidth - reserved));
	const dockedTreeWidth = treeOpen ? fitTree(dockedDiffWidth + MIN_TERMINAL_WIDTH) : 0;
	const treeReserved = expanded ? MIN_DIFF_WIDTH : dockedDiffWidth + MIN_TERMINAL_WIDTH;
	const renderedTreeWidth = treeOpen ? fitTree(treeReserved) : 0;
	const renderedDiffWidth = expanded && rowWidth !== undefined
		? expandReviewDiff({ rowWidth, treeWidth: renderedTreeWidth, minDiff: MIN_DIFF_WIDTH })
		: dockedDiffWidth;
	const maxTreeWidth = rowWidth === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(MIN_TREE_WIDTH, rowWidth - treeReserved);

	const rowRef = useCallback(
		(element: HTMLDivElement | null) => {
			rowElement.current = element;
			if (!element) {
				return;
			}

			element.style.setProperty(REVIEW_DIFF_WIDTH_PROPERTY, `${renderedDiffWidth}px`);
			element.style.setProperty(REVIEW_TREE_WIDTH_PROPERTY, `${renderedTreeWidth}px`);
			setRowWidth(element.clientWidth);
			const observer = new ResizeObserver(() => setRowWidth(element.clientWidth));
			observer.observe(element);

			return () => observer.disconnect();
		},
		[renderedDiffWidth, renderedTreeWidth],
	);

	const diffDivider = useDivider({
		value: renderedDiffWidth,
		min: MIN_DIFF_WIDTH,
		max: maxDiffWidth,
		sign: -1,
		target: rowElement,
		resolve: (proposed) => {
			const { diff, tree } = squeezeReviewDiff({
				proposed,
				minDiff: MIN_DIFF_WIDTH,
				maxDiff: maxDiffWidth,
				treeOpen,
				minTree: MIN_TREE_WIDTH,
				treeWidth: renderedTreeWidth,
			});

			return {
				vars: [
					{ property: REVIEW_DIFF_WIDTH_PROPERTY, value: diff },
					{ property: REVIEW_TREE_WIDTH_PROPERTY, value: tree },
				],
				commit: () => {
					setDiffWidth(diff);
					if (treeOpen && tree !== renderedTreeWidth) {
						setTreeWidth(tree);
						onPersistLayout({ diffWidth: diff, treeWidth: tree });
						return;
					}
					onPersistLayout({ diffWidth: diff });
				},
			};
		},
	});

	const treeDivider = useDivider({
		value: renderedTreeWidth,
		min: MIN_TREE_WIDTH,
		max: Math.min(maxTreeWidth, renderedTreeWidth + renderedDiffWidth - MIN_DIFF_WIDTH),
		sign: 1,
		target: rowElement,
		resolve: (proposed) => {
			const { tree, diff } = redistributeReviewTree({
				proposed,
				total: renderedTreeWidth + renderedDiffWidth,
				minTree: MIN_TREE_WIDTH,
				minDiff: MIN_DIFF_WIDTH,
			});

			return {
				vars: [
					{ property: REVIEW_TREE_WIDTH_PROPERTY, value: tree },
					{ property: REVIEW_DIFF_WIDTH_PROPERTY, value: diff },
				],
				commit: () => {
					setTreeWidth(tree);
					// Expanded, the diff only fills what the tree leaves behind, so writing
					// that width down would overwrite the width the panel docks back to.
					if (expanded) {
						onPersistLayout({ treeWidth: tree });
						return;
					}

					setDiffWidth(diff);
					onPersistLayout({ diffWidth: diff, treeWidth: tree });
				},
			};
		},
	});

	return {
		rowRef,
		diffDivider,
		treeDivider,
		resizing: diffDivider.resizing,
		dockedWidth: REVIEW_SEPARATOR_WIDTH + dockedDiffWidth + dockedTreeWidth,
		liveReviewWidth: `calc(${REVIEW_DIFF_WIDTH_VALUE} + ${REVIEW_TREE_WIDTH_VALUE} + ${REVIEW_SEPARATOR_WIDTH}px)`,
	};
}
