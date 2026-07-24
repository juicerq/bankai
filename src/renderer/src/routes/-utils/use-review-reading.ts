import { keepPreviousData, type QueryClient, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useSyncExternalStore } from "react";
import type { FileChange, FullFile, ReviewContent, ReviewMode, ReviewSnapshot } from "@main/git/contracts";
import { orpc } from "@renderer/lib/api";

const PENDING = { status: "pending" } as const;

type ReviewWatchState =
	| typeof PENDING
	| { status: "ready" }
	| { status: "error"; error: string };

interface ReviewScopeInput {
	projectId: string;
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
	error?: string;
	refreshing: boolean;
}

export function useReviewReading({
	projectId,
	mode,
	shellId,
	isFileOpen,
	focusedPath,
}: {
	projectId: string;
	mode: ReviewMode;
	shellId?: string;
	isFileOpen: (path: string) => boolean;
	focusedPath?: string;
}): ReviewReading {
	const watch = useReviewWatch(projectId);
	const watchReady = watch.status === "ready";
	const watchError = watch.status === "error" ? watch.error : undefined;

	const turnShellId = mode === "last-turn" ? shellId : undefined;
	const scope = useMemo(
		() => ({ projectId, mode, ...(turnShellId ? { shellId: turnShellId } : {}) }),
		[projectId, mode, turnShellId],
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

	const fullFileQuery = useQuery(
		orpc.review.fullFile.queryOptions({
			input: { ...scope, path: focusedPath ?? "" },
			enabled: watchReady && !!focusedPath,
		}),
	);

	const reading: ReviewReadingGeneration | undefined = currentSnapshot
		? {
			layoutGeneration: layout.generation,
			snapshot: currentSnapshot,
			...(!snapshotQuery.isPlaceholderData && contentReady ? { contentByPath } : {}),
		}
		: undefined;
	const published = useRetainedReading(scope, reading);

	if (watchError) {
		return { error: watchError, refreshing: false };
	}

	const result: ReviewReading = { refreshing: !!published && published !== reading };
	if (published) {
		result.generation = published;
	}
	if (fullFileQuery.data) {
		result.fullFile = fullFileQuery.data;
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
	const key = `${scope.projectId}\u0000${scope.mode}\u0000${scope.shellId ?? ""}\u0000${files.map((file) => file.path).join("\n")}`;
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

function useReviewWatch(projectId: string) {
	const queryClient = useQueryClient();
	const observer = useMemo(
		() => new ReviewQueryObserver(projectId, queryClient),
		[projectId, queryClient],
	);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class ReviewQueryObserver {
	private state: ReviewWatchState = PENDING;
	private generation = 0;

	constructor(
		private readonly projectId: string,
		private readonly queryClient: QueryClient,
	) {}

	readonly getSnapshot = () => this.state;

	readonly subscribe = (notify: () => void) => {
		const generation = ++this.generation;
		let watching = false;
		this.state = PENDING;
		const stopListening = window.bankaiReview.onChanged((event) => {
			if (event.projectId === this.projectId) {
				this.refresh().catch((err) => console.error("Failed to refresh review changes", err));
			}
		});

		window.bankaiReview.watch(this.projectId)
			.then(async () => {
				watching = true;
				if (generation !== this.generation) {
					window.bankaiReview.unwatch(this.projectId);
					return;
				}

				await this.refresh();
				if (generation !== this.generation) {
					return;
				}

				this.state = { status: "ready" };
				notify();
			})
			.catch((err) => {
				if (generation !== this.generation) {
					return;
				}

				this.state = { status: "error", error: String(err) };
				notify();
			});

		return () => {
			this.generation += 1;
			this.state = PENDING;
			stopListening();
			if (watching) {
				window.bankaiReview.unwatch(this.projectId);
			}
		};
	};

	private async refresh() {
		const filters = [
			{ queryKey: orpc.review.snapshot.key({ type: "query", input: { projectId: this.projectId } }) },
			{ queryKey: orpc.review.files.key({ type: "query", input: { projectId: this.projectId } }) },
			{ queryKey: orpc.review.file.key({ type: "query", input: { projectId: this.projectId } }) },
			{ queryKey: orpc.review.fullFile.key({ type: "query", input: { projectId: this.projectId } }) },
		];
		await Promise.all(filters.map((filter) => this.queryClient.cancelQueries(filter)));
		await Promise.all(filters.map((filter) => this.queryClient.invalidateQueries(filter)));
	}
}
