import { afterEach, expect, test } from "bun:test";
import { useSelector } from "@tanstack/react-store";
import { useRef, useState } from "react";
import type { FileChange } from "@main/git/git-contracts";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import { redistributeReviewTree } from "@renderer/routes/-utils/review-layout";
import { createReviewPanelStore } from "@renderer/routes/-utils/review-panel-store";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function ReviewTreeHarness() {
	const [widths, setWidths] = useState({ tree: 200, diff: 810 });
	const row = useRef<HTMLDivElement>(null);
	const divider = useDivider({
		value: widths.tree,
		min: 120,
		max: widths.tree + widths.diff - 280,
		sign: 1,
		target: row,
		resolve: (proposed) => {
			const next = redistributeReviewTree({ proposed, total: widths.tree + widths.diff, minTree: 120, minDiff: 280 });

			return {
				vars: [],
				commit: () => setWidths({ tree: next.tree, diff: next.diff }),
			};
		},
	});

	return (
		<main
			data-component="review-split"
			data-tree-width={widths.tree}
			data-diff-width={widths.diff}
			data-total-width={widths.tree + widths.diff}
			ref={row}
		>
			<ReviewTree
				files={[]}
				divider={divider}
				onOpenFile={() => {}}
				onToggleFocusFile={() => {}}
				onCloseFiles={() => {}}
			/>
		</main>
	);
}

function change(path: string): FileChange {
	return { path, status: "modified", additions: 1, deletions: 0 };
}

const TREE_FILES = [change("src/app/one.ts"), change("src/app/two.ts"), change("README.md")];

function ReviewTreeFilesHarness() {
	const row = useRef<HTMLDivElement>(null);
	const [panel] = useState(createReviewPanelStore);
	const closedFiles = useSelector(panel, (state) => state.closedFiles);
	const divider = useDivider({
		value: 200,
		min: 120,
		max: 400,
		sign: 1,
		target: row,
		resolve: () => ({ vars: [], commit: () => {} }),
	});

	return (
		<main data-component="review-split" data-closed={[...closedFiles].sort().join(" ")} ref={row}>
			<ReviewTree
				files={TREE_FILES}
				divider={divider}
				onOpenFile={() => {}}
				onToggleFocusFile={() => {}}
				onCloseFiles={panel.actions.closeScope}
			/>
		</main>
	);
}

function directoryRow(name: string) {
	const rows = [...get("review-tree").querySelectorAll<HTMLElement>("[aria-expanded]")];
	const match = rows.find((element) => element.textContent === name);

	if (!match) {
		throw new Error(`No directory row for ${name}`);
	}

	return match;
}

test("the tree divider redistributes a fixed Review width", () => {
	render(<ReviewTreeHarness />);

	const handle = slot(get("review-tree"), "resize");
	fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
	fireEvent.pointerMove(handle, { clientX: 280, pointerId: 1 });
	fireEvent.pointerUp(handle, { clientX: 280, pointerId: 1 });

	const split = get("review-split");
	expect(split.dataset.treeWidth).toBe("280");
	expect(split.dataset.diffWidth).toBe("730");
	expect(split.dataset.totalWidth).toBe("1010");
});

test("collapsing a directory closes the diffs of the files under it", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.click(directoryRow("src/app"));

	expect(get("review-split").dataset.closed).toBe("src/app/one.ts src/app/two.ts");
});

test("expanding a directory reopens every file under it", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.click(directoryRow("src/app"));
	fireEvent.click(directoryRow("src/app"));

	expect(get("review-split").dataset.closed).toBe("");
});
