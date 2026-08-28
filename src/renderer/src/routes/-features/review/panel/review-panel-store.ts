import { createStore } from "@tanstack/react-store";
import type { ReviewMode } from "@shared/review";
import { DEFAULT_REVIEW_MODE } from "@renderer/routes/-features/review/header/review-scope";

export type ReviewTreeView = "changes" | "browse";

export interface ReviewPanelState {
	mode: ReviewMode;
	treeView: ReviewTreeView;
	fileClosedOverrides: ReadonlyMap<string, boolean>;
	focusedPath?: string;
	focusedLine?: number;
	hiddenFocusedPath?: string;
	hiddenFocusedLine?: number;
	pinnedWorktree?: string;
}

export function createReviewPanelStore() {
	const initial: ReviewPanelState = {
		mode: DEFAULT_REVIEW_MODE,
		treeView: "changes",
		fileClosedOverrides: new Map<string, boolean>(),
	};

	return createStore(initial, ({ setState, get }) => {
		const patch = (values: Partial<ReviewPanelState>) => setState((state) => ({ ...state, ...values }));

		return {
			selectMode: (mode: ReviewMode) => {
				patch({ mode });
			},

			selectTreeView: (treeView: ReviewTreeView) => {
				const { treeView: current, focusedPath, focusedLine, hiddenFocusedPath, hiddenFocusedLine } = get();

				if (treeView === current) {
					return;
				}
				patch({
					treeView,
					focusedPath: hiddenFocusedPath,
					focusedLine: hiddenFocusedLine,
					hiddenFocusedPath: focusedPath,
					hiddenFocusedLine: focusedLine,
				});
			},

			pinWorktree: (pinnedWorktree?: string) => {
				patch({
					pinnedWorktree,
					focusedPath: undefined,
					focusedLine: undefined,
					hiddenFocusedPath: undefined,
					hiddenFocusedLine: undefined,
				});
			},

			openFile: (path: string) => {
				if (get().fileClosedOverrides.get(path) === false) {
					return;
				}

				patch({ fileClosedOverrides: new Map(get().fileClosedOverrides).set(path, false) });
			},

			setFileClosed: (path: string, closed: boolean) => {
				if (get().fileClosedOverrides.get(path) === closed) {
					return;
				}

				patch({ fileClosedOverrides: new Map(get().fileClosedOverrides).set(path, closed) });
			},

			setFilesClosed: (paths: string[], closed: boolean) => {
				if (paths.every((path) => get().fileClosedOverrides.get(path) === closed)) {
					return;
				}

				const fileClosedOverrides = new Map(get().fileClosedOverrides);
				for (const path of paths) {
					fileClosedOverrides.set(path, closed);
				}

				patch({ fileClosedOverrides });
			},

			clearFileOverrides: (paths: string[]) => {
				const fileClosedOverrides = new Map(get().fileClosedOverrides);
				let changed = false;
				for (const path of paths) {
					changed = fileClosedOverrides.delete(path) || changed;
				}
				if (!changed) {
					return;
				}

				patch({ fileClosedOverrides });
			},

			focusFile: (focusedPath: string, focusedLine?: number) => {
				patch({ focusedPath, focusedLine });
			},

			clearFocus: () => {
				patch({ focusedPath: undefined, focusedLine: undefined });
			},
		};
	});
}

export type ReviewPanelStore = ReturnType<typeof createReviewPanelStore>;
