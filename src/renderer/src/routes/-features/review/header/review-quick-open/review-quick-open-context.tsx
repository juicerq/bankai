import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useDeferredValue, useMemo, useState } from "react";
import { orpc } from "@renderer/lib/api";
import { usePickerNavigation } from "@renderer/routes/-features/shared/pickers/use-picker-navigation";
import { pathEntries, searchPaths } from "@renderer/routes/-features/review/tree/path-search";
import {
	groupMatches,
	searchStatus,
	type QuickOpenChoice,
	type QuickOpenMatch,
	type QuickOpenPath,
	type QuickOpenSearchStatus,
} from "@renderer/routes/-features/review/header/review-quick-open/model";

export interface ReviewQuickOpenOptions {
	projectId: string;
	worktree: string;
	paths: string[];
	onOpenFile: (path: string, line?: number) => void;
	onClose: () => void;
}

interface ReviewQuickOpenContextValue {
	dialog: {
		status: "idle" | QuickOpenSearchStatus;
		onClose: () => void;
	};
	paths: {
		filter: string;
		searching: boolean;
		matchCount: number;
		choices: QuickOpenChoice[];
		picker: ReturnType<typeof usePickerNavigation<QuickOpenChoice>>;
		onFilterChange: (value: string) => void;
		onChoose: (choice: QuickOpenChoice) => void;
		status: QuickOpenSearchStatus;
		groups: { path: string; matches: QuickOpenMatch[] }[];
	};
}

const ReviewQuickOpenContext = createContext<ReviewQuickOpenContextValue | null>(null);

export function ReviewQuickOpenProvider({
	options,
	children,
}: {
	options: ReviewQuickOpenOptions;
	children: ReactNode;
}) {
	const [filter, setFilter] = useState("");
	const deferredFilter = useDeferredValue(filter);
	const searching = filter !== deferredFilter;
	const entries = useMemo(() => pathEntries(options.paths), [options.paths]);
	const matches = useMemo(() => searchPaths(entries, deferredFilter), [entries, deferredFilter]);
	const visiblePaths: QuickOpenPath[] = matches.entries.map((entry) => ({
		kind: "path",
		key: `path:${entry.path}`,
		entry,
	}));
	const searchQuery = filter.trim();
	const { data, isFetching, isError } = useQuery(
		orpc.review.searchContent.queryOptions({
			input: { projectId: options.projectId, worktree: options.worktree, query: searchQuery },
			enabled: !!searchQuery,
			staleTime: 0,
		}),
	);
	const resultGroups = useMemo(() => groupMatches(data?.matches ?? []), [data?.matches]);
	const resultItems = useMemo(() => resultGroups.flatMap((group) => group.matches), [resultGroups]);
	const choices: QuickOpenChoice[] = [...visiblePaths, ...resultItems];
	const contentStatus = searchStatus({
		isFetching,
		isError,
		matches: data?.matches,
		truncated: data?.truncated,
	});

	const choose = (choice: QuickOpenChoice) => {
		if (choice.kind === "match") {
			options.onClose();
			options.onOpenFile(choice.match.file, choice.match.line);
			return;
		}

		if (choice.entry.kind === "directory") {
			setFilter(`${choice.entry.path}/`);
			choicePicker.clear();
			return;
		}

		options.onClose();
		options.onOpenFile(choice.entry.path);
	};

	const choicePicker = usePickerNavigation({
		items: choices,
		key: (choice) => choice.key,
		fallback: (found) => found[0],
		onChoose: (highlighted) => {
			if (searching || !highlighted) {
				return;
			}

			choose(highlighted);
		},
		onClose: options.onClose,
	});

	return (
		<ReviewQuickOpenContext
			value={{
				dialog: {
					status: searchQuery ? contentStatus : "idle",
					onClose: options.onClose,
				},
				paths: {
					filter,
					searching,
					matchCount: matches.total,
					choices,
					picker: choicePicker,
					onFilterChange: setFilter,
					onChoose: choose,
					status: contentStatus,
					groups: resultGroups,
				},
			}}
		>
			{children}
		</ReviewQuickOpenContext>
	);
}

export function useReviewQuickOpen() {
	const quickOpen = use(ReviewQuickOpenContext);
	if (!quickOpen) {
		throw new Error("useReviewQuickOpen needs a ReviewQuickOpenProvider above it");
	}

	return quickOpen;
}
