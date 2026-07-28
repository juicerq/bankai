import { afterEach, expect, test } from "bun:test";
import { ReviewHeader } from "@renderer/routes/-components/review-header";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const PROJECT = "/home/jui/projects/bankai-2";

function renderHeader({ filesClosed, expanded = false, onToggleAllFiles = () => {}, onToggleExpanded = () => {} }: {
	filesClosed: boolean;
	expanded?: boolean;
	onToggleAllFiles?: () => void;
	onToggleExpanded?: () => void;
}) {
	render(
		<ReviewHeader
			mode="last-turn"
			sharedWith={[]}
			worktrees={{
				worktrees: [{ path: PROJECT, branch: "main" }],
				activePath: PROJECT,
				mainPath: PROJECT,
				pinnedPath: undefined,
				shellPath: undefined,
				activity: new Map(),
				removeFailure: undefined,
				onSelect: () => {},
				onRemove: () => {},
			}}
			totals={{ additions: 12, deletions: 4 }}
			refreshing={false}
			treeOpen={false}
			expanded={expanded}
			filesClosed={filesClosed}
			onSelectMode={() => {}}
			onTreeOpenChange={() => {}}
			onToggleExpanded={onToggleExpanded}
			onToggleAllFiles={onToggleAllFiles}
		/>,
	);
}

function allFilesButton(label: string) {
	const button = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
	if (!button) {
		throw new Error(`No header control labelled ${label}`);
	}

	return button;
}

test("open files offer a single control that collapses them all", () => {
	let toggled = 0;
	renderHeader({ filesClosed: false, onToggleAllFiles: () => toggled++ });

	fireEvent.click(allFilesButton("Collapse all files"));

	expect(toggled).toBe(1);
	expect(document.querySelector('[aria-label="Expand all files"]')).toBeNull();
});

test("the same control expands the files once they are all closed", () => {
	renderHeader({ filesClosed: true });

	expect(allFilesButton("Expand all files")).toBeDefined();
	expect(document.querySelector('[aria-label="Collapse all files"]')).toBeNull();
});

test("the panel carries its own expand control and reports the state it is in", () => {
	let toggled = 0;
	renderHeader({ filesClosed: false, onToggleExpanded: () => toggled++ });

	const control = get("review-expand");
	expect(control.dataset.expanded).toBe("false");

	fireEvent.click(control);
	expect(toggled).toBe(1);
});

test("the expand control shows the panel is already expanded", () => {
	renderHeader({ filesClosed: false, expanded: true });

	expect(get("review-expand").dataset.expanded).toBe("true");
});
