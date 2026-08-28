import { ReviewTransport, setReviewTransport } from "./orpc-transport";
import { afterEach, expect, test } from "bun:test";
import type { Project } from "@shared/projects";
import { orpc } from "@renderer/lib/api";
import { installReviewPrewarm } from "@renderer/lib/prewarm-reviews";
import { DEFAULT_REVIEW_MODE } from "@renderer/routes/-features/review/header/review-scope";
import { QueryClient } from "@tanstack/react-query";
import { type } from "arktype";
import { waitFor } from "./testing-library";

const snapshotInput = type({ projectId: "string", worktree: "string", mode: "string" });

let disposers: (() => void)[] = [];

afterEach(() => {
	for (const dispose of disposers) {
		dispose();
	}

	disposers = [];
});

function project(id: string): Project {
	return { id, name: id, path: `/tmp/${id}`, createdAt: 0, reviewClosedTargets: [] };
}

function setListData(queryClient: QueryClient, projects: Project[]) {
	queryClient.setQueryData(
		orpc.projects.list.queryOptions().queryKey,
		projects,
	);
}

function setup(initial?: Project[]) {
	const transport = new ReviewTransport();
	setReviewTransport(transport);

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { staleTime: Infinity, retry: false, gcTime: 0 },
		},
	});
	if (initial) {
		setListData(queryClient, initial);
	}

	disposers.push(installReviewPrewarm({ queryClient, mode: DEFAULT_REVIEW_MODE }));

	return { transport, queryClient };
}

function prewarmedProjectIds(transport: ReviewTransport) {
	return transport
		.callsFor("snapshot")
		.map((input) => snapshotInput.assert(input))
		.map((input) => input.projectId);
}

test("launch prewarms a snapshot for every mounted project in the default mode", async () => {
	const { transport } = setup([project("a"), project("b"), project("c")]);

	await waitFor(() => expect(transport.pendingCount("snapshot")).toBe(3));

	expect(prewarmedProjectIds(transport).sort()).toEqual(["a", "b", "c"]);
	for (const input of transport.callsFor("snapshot")) {
		expect(snapshotInput.assert(input).mode).toBe(DEFAULT_REVIEW_MODE);
	}
});

test("prewarm reads the snapshot under the worktree the review panel opens by default", async () => {
	const { transport, queryClient } = setup([project("a")]);

	await waitFor(() => expect(transport.pendingCount("snapshot")).toBe(1));

	expect(snapshotInput.assert(transport.callsFor("snapshot")[0]).worktree).toBe(project("a").path);
	expect(
		queryClient.getQueryCache().findAll({
			queryKey: orpc.review.snapshot.key({
				type: "query",
				input: { projectId: "a", worktree: project("a").path },
			}),
		}),
	).toHaveLength(1);
});

test("prewarm stops listening to the cache once the projects list resolves", async () => {
	const { transport, queryClient } = setup([project("a")]);
	await waitFor(() => expect(transport.pendingCount("snapshot")).toBe(1));

	setListData(queryClient, [project("a"), project("b")]);
	await waitFor(() => expect(transport.pendingCount("snapshot")).toBe(1));

	expect(prewarmedProjectIds(transport)).toEqual(["a"]);
});

test("prewarm does not read any snapshot until the projects list resolves", async () => {
	const { transport, queryClient } = setup();

	expect(transport.callsFor("snapshot")).toEqual([]);

	setListData(queryClient, [project("a")]);

	await waitFor(() => expect(transport.pendingCount("snapshot")).toBe(1));
	expect(prewarmedProjectIds(transport)).toEqual(["a"]);
});
