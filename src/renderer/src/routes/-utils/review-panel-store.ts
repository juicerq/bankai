import { createStore } from "@tanstack/react-store";
import type { ReviewMode } from "@main/git/git-contracts";
import { DEFAULT_REVIEW_MODE } from "@renderer/routes/-utils/review-scope";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

export type ReviewTreeView = "changes" | "browse";

export interface ReviewPanelState {
	mode: ReviewMode;
	treeView: ReviewTreeView;
	closedFiles: ReadonlySet<string>;
	focusedPath?: string;
	pinnedWorktree?: string;
}

export function createReviewPanelStore() {
	const initial: ReviewPanelState = {
		mode: DEFAULT_REVIEW_MODE,
		treeView: "changes",
		closedFiles: new Set<string>(),
	};

	return createStore(initial, ({ setState, get }) => {
		const patch = (values: Partial<ReviewPanelState>) => setState((state) => ({ ...state, ...values }));

		return {
			selectMode: (mode: ReviewMode) => {
				patch({ mode, focusedPath: undefined });
			},

			toggleTreeView: () => {
				patch({ treeView: get().treeView === "browse" ? "changes" : "browse", focusedPath: undefined });
			},

			pinWorktree: (pinnedWorktree?: string) => {
				patch({ pinnedWorktree, focusedPath: undefined });
			},

			openFile: (path: string) => {
				const closedFiles = new Set(get().closedFiles);
				if (!closedFiles.delete(path)) {
					return;
				}

				patch({ closedFiles });
			},

			toggleFile: (path: string) => {
				patch({ closedFiles: toggledSet(get().closedFiles, path) });
			},

			closeScope: (paths: string[], closed: boolean) => {
				if (paths.every((path) => get().closedFiles.has(path) === closed)) {
					return;
				}

				const closedFiles = new Set(get().closedFiles);
				for (const path of paths) {
					if (closed) {
						closedFiles.add(path);
					} else {
						closedFiles.delete(path);
					}
				}

				patch({ closedFiles });
			},

			focusFile: (focusedPath: string) => {
				patch({ focusedPath });
			},

			clearFocus: () => {
				patch({ focusedPath: undefined });
			},
		};
	});
}
