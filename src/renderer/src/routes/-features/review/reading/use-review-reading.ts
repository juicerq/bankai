import { keepPreviousData, type QueryClient, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useSyncExternalStore } from "react";
import type { FileChange, FullFile, ReviewContent, ReviewMode, ReviewSnapshot } from "@shared/review";
import { orpc } from "@renderer/lib/api";
import { streamResync } from "@renderer/lib/stream/resync";
import { reviewStream } from "@renderer/lib/stream/review";

const PENDING = { status: "pending" } as const;

type ReviewWatchState =
	| typeof PENDING
	| { status: "ready" }
	| { status: "error"; error: string };

interface ReviewScopeInput {
	projectId: string;
	worktree: string;
	mode: ReviewMode;
	shellId?: string;
}

interface ReviewReadingGeneration {
	layoutGeneration: number;
	snapshot: ReviewSnapshot;
	contentByPath?: ReadonlyMap<string, ReviewContent>;
}

export interface ReviewReading {
	generation?: ReviewReadingGeneration;
	fullFile?: FullFile;
	fullFileError?: string;
	error?: string;
	refreshing: boolean;
}

export function useReviewReading({
	projectId,
	worktree,
	mode,
	shellId,
	isFileOpen,
	focusedPath,
}: {
	projectId: string;
	worktree: string;
	mode: ReviewMode;
	shellId?: string;
	isFileOpen: (path: string) => boolean;
	focusedPath?: string;
}): ReviewReading {
	const watch = useReviewWatch(projectId, worktree);
	const watchReady = watch.status === "ready";
	const watchError = watch.status === "error" ? watch.error : undefined;

	const turnShellId = mode === "last-turn" ? shellId : undefined;
	const scope = useMemo(
		() => ({ projectId, worktree, mode, ...(turnShellId ? { shellId: turnShellId } : {}) }),
		[projectId, worktree, mode, turnShellId],
	);

	const snapshotQuery = useQuery(
		orpc.review.snapshot.queryOptions({
			input: scope,
			enabled: watchReady,
			placeholderData: keepPreviousData,
		}),
	);
	const currentSnapshot = watchError ? undefined : snapshotQuery.data;
	const queryError = snapshotQuery.isError ? String(snapshotQuery.error) : undefined;
	const files = currentSnapshot?.files ?? [];

	const layout = useLayoutGeneration(scope, files, isFileOpen);
	const initialPathSet = useMemo(() => new Set(layout.initialPaths), [layout.initialPaths]);

	const prepare = watchReady && !snapshotQuery.isPlaceholderData;

	const initialContentQuery = useQuery(
		orpc.review.files.queryOptions({
			input: { ...scope, files: layout.initialPaths },
			enabled: prepare && layout.initialPaths.length > 0,
		}),
	);
	const fileQueries = useQueries({
		queries: files.map((file) =>
			orpc.review.file.queryOptions({
				input: { ...scope, path: file.path },
				enabled: prepare && isFileOpen(file.path) && !initialPathSet.has(file.path),
			}),
		),
	});

	const initialContent = initialContentQuery.data;
	const initialContentError = initialContentQuery.isError;
	const contentByPath = useMemo(() => {
		const content = new Map<string, ReviewContent>();
		for (const file of initialContent?.files ?? []) {
			content.set(file.path, file.content);
		}
		if (initialContentError) {
			for (const path of layout.initialPaths) {
				content.set(path, { status: "unavailable" });
			}
		}
		for (const [index, query] of fileQueries.entries()) {
			const file = files[index];
			if (file && query.data) {
				content.set(file.path, query.data);
			} else if (file && query.isError) {
				content.set(file.path, { status: "unavailable" });
			}
		}
		return content;
	}, [fileQueries, files, initialContent, initialContentError, layout.initialPaths]);

	const contentReady = files.every((file, index) => {
		if (!isFileOpen(file.path)) {
			return true;
		}
		if (initialPathSet.has(file.path)) {
			return contentByPath.has(file.path);
		}
		const query = fileQueries[index];
		return !!query?.data || !!query?.isError;
	});

	const focusedChanged = !!focusedPath && files.some((file) => file.path === focusedPath);
	const snapshotComing = !watchError && snapshotQuery.isPending;
	const focusedRaw = !!focusedPath && !focusedChanged && !snapshotComing;

	const fullFileQuery = useQuery(
		orpc.review.fullFile.queryOptions({
			input: { ...scope, path: focusedPath ?? "" },
			enabled: watchReady && focusedChanged,
		}),
	);
	const browseFileQuery = useQuery(
		orpc.review.browseFile.queryOptions({
			input: { projectId, worktree, path: focusedPath ?? "" },
			enabled: focusedRaw,
		}),
	);
	const focusedQuery = focusedChanged ? fullFileQuery : browseFileQuery;

	const reading: ReviewReadingGeneration | undefined = currentSnapshot
		? {
			layoutGeneration: layout.generation,
			snapshot: currentSnapshot,
			...(!snapshotQuery.isPlaceholderData && contentReady ? { contentByPath } : {}),
		}
		: undefined;
	const published = useRetainedReading(scope, reading);

	const focused: Pick<ReviewReading, "fullFile" | "fullFileError"> = {};
	if (focusedQuery.data) {
		focused.fullFile = focusedQuery.data;
	} else if (focusedQuery.error) {
		focused.fullFileError = String(focusedQuery.error);
	}

	if (watchError) {
		return { ...focused, error: watchError, refreshing: false };
	}

	const result: ReviewReading = { ...focused, refreshing: !!published && published !== reading };
	if (published) {
		result.generation = published;
	}
	if (queryError) {
		result.error = queryError;
	}

	return result;
}

function useRetainedReading(scope: ReviewScopeInput, reading?: ReviewReadingGeneration) {
	const ref = useRef<{ scope: ReviewScopeInput; reading: ReviewReadingGeneration }>(null);

	if (reading?.contentByPath) {
		ref.current = { scope, reading };
		return reading;
	}

	const retained = ref.current;
	const replaces = retained?.reading.layoutGeneration !== reading?.layoutGeneration;
	if (retained && replaces && retained.scope === scope) {
		return retained.reading;
	}

	return reading;
}

function useLayoutGeneration(
	scope: ReviewScopeInput,
	files: FileChange[],
	isFileOpen: (path: string) => boolean,
) {
	const ref = useRef<{ key: string; generation: number; initialPaths: string[] }>(null);
	const key = `${scope.projectId}\u0000${scope.worktree}\u0000${scope.mode}\u0000${scope.shellId ?? ""}\u0000${files.map((file) => file.path).join("\n")}`;
	const previous = ref.current;

	if (!previous || previous.key !== key) {
		const next = {
			key,
			generation: (previous?.generation ?? 0) + 1,
			initialPaths: files.filter((file) => isFileOpen(file.path)).map((file) => file.path),
		};
		ref.current = next;
		return next;
	}

	return previous;
}

function useReviewWatch(projectId: string, worktree: string) {
	const queryClient = useQueryClient();
	const observer = useMemo(
		() => new ReviewQueryObserver({ projectId, worktree }, queryClient),
		[projectId, worktree, queryClient],
	);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class ReviewQueryObserver {
	private state: ReviewWatchState = PENDING;
	private generation = 0;
	private watching = false;

	constructor(
		private readonly watched: { projectId: string; worktree: string },
		private readonly queryClient: QueryClient,
	) {}

	readonly getSnapshot = () => this.state;

	readonly subscribe = (notify: () => void) => {
		this.state = PENDING;
		const stopListening = reviewStream.onChanged((event) => {
			if (event.projectId === this.watched.projectId && event.worktree === this.watched.worktree) {
				this.refresh().catch((err) => console.error("Failed to refresh review changes", err));
			}
		});
		const stopResync = streamResync.register("watch", () => this.watch({ notify, refresh: false }));

		this.watch({ notify, refresh: true }).catch((err) => console.error("Failed to watch review changes", err));

		return () => {
			this.generation += 1;
			this.state = PENDING;
			stopListening();
			stopResync();
			if (this.watching) {
				this.watching = false;
				reviewStream.unwatch(this.watched);
			}
		};
	};

	private async watch({ notify, refresh }: { notify: () => void; refresh: boolean }) {
		const generation = ++this.generation;

		try {
			await reviewStream.watch(this.watched);
		} catch (err) {
			if (generation === this.generation) {
				this.state = { status: "error", error: String(err) };
				notify();
			}

			return;
		}

		if (generation !== this.generation) {
			reviewStream.unwatch(this.watched);

			return;
		}

		this.watching = true;

		if (refresh) {
			await this.refresh();

			if (generation !== this.generation) {
				return;
			}
		}

		this.state = { status: "ready" };
		notify();
	}

	private async refresh() {
		const projectInput = { projectId: this.watched.projectId };
		const worktreeInput = { ...projectInput, worktree: this.watched.worktree };
		const worktreeFilters = [
			{ queryKey: orpc.review.snapshot.key({ type: "query", input: worktreeInput }) },
			{ queryKey: orpc.review.files.key({ type: "query", input: worktreeInput }) },
			{ queryKey: orpc.review.file.key({ type: "query", input: worktreeInput }) },
			{ queryKey: orpc.review.fullFile.key({ type: "query", input: worktreeInput }) },
			{ queryKey: orpc.review.browseFiles.key({ type: "query", input: worktreeInput }) },
			{ queryKey: orpc.review.browseFile.key({ type: "query", input: worktreeInput }) },
			{ queryKey: orpc.review.searchContent.key({ type: "query", input: worktreeInput }) },
		];
		const filters = [
			{ queryKey: orpc.review.worktrees.key({ type: "query", input: projectInput }), exact: true },
			...worktreeFilters.flatMap((filter) =>
				this.queryClient
					.getQueryCache()
					.findAll(filter)
					.map((query) => ({ queryKey: query.queryKey, exact: true })),
			),
		];
		await Promise.all(filters.map((filter) => this.queryClient.cancelQueries(filter)));
		await Promise.all(filters.map((filter) => this.queryClient.invalidateQueries(filter)));
	}
}
