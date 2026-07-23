import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import { REVIEW_TREE_WIDTH_VALUE } from "@renderer/routes/-utils/use-panel-resize";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function ReviewTreeHarness() {
	const [widths, setWidths] = useState({ treeWidth: 200, diffWidth: 810 });

	return (
		<main
			data-component="review-split"
			data-tree-width={widths.treeWidth}
			data-diff-width={widths.diffWidth}
			data-total-width={widths.treeWidth + widths.diffWidth}
		>
			<ReviewTree
				files={[]}
				defaultWidth={200}
				liveWidth={REVIEW_TREE_WIDTH_VALUE}
				preferredWidth={widths.treeWidth}
				minWidth={120}
				diffWidth={widths.diffWidth}
				minDiffWidth={280}
				onWidthsChange={setWidths}
				onOpenFile={() => {}}
				onToggleFocusFile={() => {}}
			/>
		</main>
	);
}

test("the tree divider redistributes a fixed Review width", () => {
	render(<ReviewTreeHarness />);

	const handle = slot(get("review-tree"), "resize");
	fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
	fireEvent.pointerMove(handle, { clientX: 280, pointerId: 1 });

	const split = get("review-split");
	expect(split.dataset.treeWidth).toBe("280");
	expect(split.dataset.diffWidth).toBe("730");
	expect(split.dataset.totalWidth).toBe("1010");

	fireEvent.pointerUp(handle, { pointerId: 1 });
});
