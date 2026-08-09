import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { orpc } from "@renderer/lib/api";
import { usePickerNavigation } from "@renderer/routes/-features/shared/pickers/use-picker-navigation";
import { pathEntries, searchPaths } from "@renderer/routes/-features/review/tree/path-search";
import {
	groupMatches,
	searchStatus,
	VISIBLE_MATCHES,
	type QuickOpenChoice,
	type QuickOpenContentAction,
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
		mode: "paths" | "content";
		status: "paths" | QuickOpenSearchStatus;
		onClose: () => void;
	};
	paths: {
		filter: string;
		matchCount: number;
		choices: QuickOpenChoice[];
		picker: ReturnType<typeof usePickerNavigation<QuickOpenChoice>>;
		onFilterChange: (value: string) => void;
		onChoose: (choice: QuickOpenChoice) => void;
	};
	content: {
		query: string;
		status: QuickOpenSearchStatus;
		groups: { path: string; matches: QuickOpenMatch[] }[];
		picker: ReturnType<typeof usePickerNavigation<QuickOpenMatch>>;
		onBack: () => void;
		onOpen: (match: QuickOpenMatch) => void;
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
	const [mode, setMode] = useState<"paths" | "content">("paths");
	const [filter, setFilter] = useState("");
	const entries = useMemo(() => pathEntries(options.paths), [options.paths]);
	const matches = searchPaths(entries, filter);
	const visiblePaths: QuickOpenPath[] = matches.slice(0, VISIBLE_MATCHES).map((entry) => ({
		kind: "path",
		key: `path:${entry.path}`,
		entry,
	}));
	const trimmedFilter = filter.trim();
	const contentAction: QuickOpenContentAction | undefined = trimmedFilter
		? { kind: "content", key: `content:${trimmedFilter}`, query: trimmedFilter }
		: undefined;
	const choices: QuickOpenChoice[] = contentAction ? [contentAction, ...visiblePaths] : visiblePaths;
	const searchQuery = mode === "content" ? trimmedFilter : "";
	const { data, isFetching, isError } = useQuery(
		orpc.review.searchContent.queryOptions({
			input: { projectId: options.projectId, worktree: options.worktree, query: searchQuery },
			enabled: mode === "content",
			staleTime: 0,
		}),
	);
	const resultGroups = useMemo(() => groupMatches(data?.matches ?? []), [data?.matches]);
	const resultItems = useMemo(() => resultGroups.flatMap((group) => group.matches), [resultGroups]);
	const contentStatus = searchStatus({
		isFetching,
		isError,
		matches: data?.matches,
		truncated: data?.truncated,
	});

	const returnToPaths = () => {
		setMode("paths");
	};

	const openMatch = ({ match }: QuickOpenMatch) => {
		options.onClose();
		options.onOpenFile(match.file, match.line);
	};

	const resultPicker = usePickerNavigation({
		items: resultItems,
		key: (item) => item.key,
		fallback: (found) => found[0],
		onChoose: (highlighted) => {
			if (highlighted) {
				openMatch(highlighted);
			}
		},
		onClose: returnToPaths,
	});

	const choose = (choice: QuickOpenChoice) => {
		if (choice.kind === "content") {
			setMode("content");
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
		fallback: (found) => found[1] ?? found[0],
		onChoose: (highlighted) => {
			if (highlighted) {
				choose(highlighted);
			}
		},
		onClose: options.onClose,
	});

	return (
		<ReviewQuickOpenContext
			value={{
				dialog: {
					mode,
					status: mode === "paths" ? "paths" : contentStatus,
					onClose: options.onClose,
				},
				paths: {
					filter,
					matchCount: matches.length,
					choices,
					picker: choicePicker,
					onFilterChange: setFilter,
					onChoose: choose,
				},
				content: {
					query: searchQuery,
					status: contentStatus,
					groups: resultGroups,
					picker: resultPicker,
					onBack: returnToPaths,
					onOpen: openMatch,
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
