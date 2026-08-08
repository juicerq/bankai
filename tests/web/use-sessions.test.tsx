import { type ContinuityTransport, setContinuityTransport } from "./orpc-transport";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContinuityValue } from "@shared/continuity";
import { orpc } from "@renderer/lib/api";
import { useSessions } from "@renderer/routes/-features/sessions/lifecycle/use-sessions";
import { act, cleanup, renderHook, waitFor } from "./testing-library";

const { queryKey } = orpc.continuity.get.queryOptions();

let transport: ContinuityTransport;
let queryClient: QueryClient;

function cached(): ContinuityValue {
	return queryClient.getQueryData<{ value: ContinuityValue }>(queryKey)?.value ?? { workspaces: [] };
}

async function renderSessions(value: ContinuityValue) {
	transport = { value, calls: [] };
	setContinuityTransport(transport);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
	});

	const rendered = renderHook(() => useSessions(), {
		wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
	});

	await waitFor(() => {
		expect(rendered.result.current.continuity).toEqual(value);
	});

	return rendered;
}

const SESSION = { harness: "claude", sessionId: "abc", cwd: "/repo" };

afterEach(cleanup);

beforeEach(() => {
	setContinuityTransport({ value: { workspaces: [] }, calls: [] });
});

test("opening a shell lands in the cache named and selected before the main process answers", async () => {
	const { result } = await renderSessions({
		workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }],
	});

	act(() => result.current.openShell("p1"));

	const [, opened] = cached().workspaces[0]?.shells ?? [];
	expect(opened?.label).toBe("Shell 2");
	expect(cached().selectedShellId).toBe(opened?.id);

	await waitFor(() => {
		expect(transport.calls).toEqual([
			{ procedure: "openShell", input: { projectId: "p1", shell: { id: opened?.id } } },
		]);
	});
});

test("a command opens a plain shell that launches it and wears its name", async () => {
	const { result } = await renderSessions({ workspaces: [{ projectId: "p1", shells: [] }] });

	act(() => result.current.openCommandShell("p1", { label: "Dev server", command: "bun run dev" }));

	expect(cached().workspaces[0]?.shells).toEqual([]);

	await waitFor(() => {
		const [opened] = cached().workspaces[0]?.shells ?? [];

		expect(opened?.title).toBe("Dev server");
		expect(cached().selectedShellId).toBe(opened?.id);
		expect(transport.calls).toEqual([{
			procedure: "openShell",
			input: {
				projectId: "p1",
				shell: {
					id: opened?.id,
					plain: true,
					launch: "bun run dev",
					title: "Dev server",
					titleSource: "user",
				},
			},
		}]);
	});
});

test("a shell opened without a harness carries the request to the main process", async () => {
	const { result } = await renderSessions({ workspaces: [] });

	act(() => result.current.openShell("p1", true));

	expect(cached().workspaces).toEqual([]);

	await waitFor(() => {
		expect(cached().workspaces[0]?.shells[0]?.plain).toBe(true);
		expect(transport.calls[0]?.input).toEqual({ projectId: "p1", shell: { id: expect.any(String), plain: true } });
	});
});

test("opening a shell asynchronously projects first and answers with the projected id", async () => {
	const { result } = await renderSessions({
		workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }],
	});

	let opening: Promise<string> | undefined;
	act(() => {
		opening = result.current.openShellAsync("p1");
	});

	const [, projected] = cached().workspaces[0]?.shells ?? [];
	expect(projected?.label).toBe("Shell 2");
	expect(cached().selectedShellId).toBe(projected?.id);

	const shellId = await opening;
	expect(shellId).toBe(projected?.id ?? "");
	expect(transport.calls).toEqual([
		{ procedure: "openShell", input: { projectId: "p1", shell: { id: shellId } } },
	]);
});

test("closing the selected shell hands the selection over in the same commit", async () => {
	const { result } = await renderSessions({
		selectedShellId: "s2",
		workspaces: [
			{
				projectId: "p1",
				shells: [
					{ id: "s1", label: "Shell 1", createdAt: 1 },
					{ id: "s2", label: "Shell 2", createdAt: 2 },
				],
			},
		],
	});

	act(() => result.current.closeShell("p1", "s2"));

	expect(cached().workspaces[0]?.shells.map((shell) => shell.id)).toEqual(["s1"]);
	expect(cached().selectedShellId).toBe("s1");
});

test("archiving files the shell and puts it to sleep, selecting wakes it again", async () => {
	const { result } = await renderSessions({
		selectedShellId: "s1",
		workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1, session: SESSION }] }],
	});

	act(() => result.current.archiveShell("p1", "s1"));

	expect(cached().workspaces[0]?.shells[0]?.archivedAt).toEqual(expect.any(Number));
	expect(result.current.residency.asleep.has("s1")).toBe(true);

	act(() => result.current.selectShell("p1", "s1"));

	expect(result.current.residency.asleep.has("s1")).toBe(false);
});

test("a gesture aimed at another project takes effect with no workspace of its own", async () => {
	const { result } = await renderSessions({
		selectedShellId: "s1",
		workspaces: [
			{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] },
			{ projectId: "p2", shells: [{ id: "s2", label: "Shell 1", createdAt: 2 }] },
		],
	});

	act(() => result.current.selectShell("p2", "s2"));

	expect(cached().selectedShellId).toBe("s2");
});

test("what a mutation answers never reaches the cache", async () => {
	const { result } = await renderSessions({ workspaces: [{ projectId: "p1", shells: [] }] });
	transport.value = { workspaces: [{ projectId: "answered-instead", shells: [] }] };

	act(() => result.current.openShell("p1"));
	await waitFor(() => {
		expect(transport.calls).toHaveLength(1);
	});

	expect(cached().workspaces.map((workspace) => workspace.projectId)).toEqual(["p1"]);
	expect(cached().workspaces[0]?.shells).toHaveLength(1);
});

test("a push that touches one project leaves another project's shells identical", async () => {
	const neighbour = { projectId: "p2", shells: [{ id: "s2", label: "Shell 1", createdAt: 2 }] };
	const { result } = await renderSessions({
		selectedShellId: "s1",
		workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }, neighbour],
	});
	const untouched = result.current.continuity.workspaces[1];

	act(() => {
		queryClient.setQueryData(queryKey, {
			value: structuredClone({
				selectedShellId: "s1",
				workspaces: [{ projectId: "p1", shells: [] }, neighbour],
			}),
			failed: false,
		});
	});

	await waitFor(() => {
		expect(result.current.continuity.workspaces[0]?.shells).toHaveLength(0);
	});

	expect(result.current.continuity.workspaces[1]).toBe(untouched);
});

test("closing a shell rolls the projection back when continuity rejects the mutation", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s2",
		workspaces: [{
			projectId: "p1",
			shells: [
				{ id: "s1", label: "Shell 1", createdAt: 1 },
				{ id: "s2", label: "Shell 2", createdAt: 2 },
			],
		}],
	};
	const { result } = await renderSessions(initial);
	transport.mutationFailure = "continuity unavailable";

	act(() => result.current.closeShell("p1", "s2"));
	expect(cached().workspaces[0]?.shells.map((shell) => shell.id)).toEqual(["s1"]);

	await waitFor(() => {
		expect(cached()).toEqual(initial);
	});
});

test("archiving a shell rolls the projection back when continuity rejects the mutation", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s1",
		workspaces: [{
			projectId: "p1",
			shells: [{ id: "s1", label: "Shell 1", createdAt: 1, session: SESSION }],
		}],
	};
	const { result } = await renderSessions(initial);
	transport.mutationFailure = "continuity unavailable";

	act(() => result.current.archiveShell("p1", "s1"));
	expect(cached().workspaces[0]?.shells[0]?.archivedAt).toEqual(expect.any(Number));

	await waitFor(() => {
		expect(cached()).toEqual(initial);
	});
});

test("renaming a shell rolls the projection back when continuity rejects the mutation", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s1",
		workspaces: [{
			projectId: "p1",
			shells: [{ id: "s1", label: "Shell 1", createdAt: 1, title: "Before", titleSource: "user" }],
		}],
	};
	const { result } = await renderSessions(initial);
	transport.mutationFailure = "continuity unavailable";

	act(() => result.current.renameShell("p1", "s1", "After"));
	expect(cached().workspaces[0]?.shells[0]?.title).toBe("After");

	await waitFor(() => {
		expect(cached()).toEqual(initial);
	});
});


test("a failed archive does not overwrite a newer rename", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s1",
		workspaces: [{
			projectId: "p1",
			shells: [{ id: "s1", label: "Shell 1", createdAt: 1, title: "Before", titleSource: "user" }],
		}],
	};
	const requests: PromiseWithResolvers<ContinuityValue>[] = [];
	const { result } = await renderSessions(initial);
	transport.mutation = () => {
		const request = Promise.withResolvers<ContinuityValue>();
		requests.push(request);
		return request.promise;
	};

	act(() => {
		result.current.archiveShell("p1", "s1");
		result.current.renameShell("p1", "s1", "Second");
	});
	await waitFor(() => expect(requests).toHaveLength(2));

	requests[0]?.reject(new Error("archive failed"));
	await waitFor(() => {
		expect(cached().workspaces[0]?.shells[0]?.title).toBe("Second");
	});

	transport.value = cached();
	requests[1]?.resolve(transport.value);
});

test("a failed projection is removed when continuity had not loaded", async () => {
	const loading = Promise.withResolvers<ContinuityValue>();
	transport = {
		value: { workspaces: [] },
		calls: [],
		load: () => loading.promise,
		mutationFailure: "continuity unavailable",
	};
	setContinuityTransport(transport);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
	});
	const { result, unmount } = renderHook(() => useSessions(), {
		wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
	});

	act(() => result.current.openShell("p1"));
	expect(queryClient.getQueryData(queryKey)).toBeDefined();

	await waitFor(() => {
		expect(queryClient.getQueryData(queryKey)).toBeUndefined();
	});

	unmount();
	loading.resolve({ workspaces: [] });
});


test("selecting an archived shell puts it back to sleep when continuity rejects the mutation", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s2",
		workspaces: [{
			projectId: "p1",
			shells: [
				{ id: "s1", label: "Shell 1", createdAt: 1, archivedAt: 2, session: SESSION },
				{ id: "s2", label: "Shell 2", createdAt: 3 },
			],
		}],
	};
	const { result } = await renderSessions(initial);
	transport.mutationFailure = "continuity unavailable";

	act(() => result.current.selectShell("p1", "s1"));
	expect(result.current.residency.asleep.has("s1")).toBe(false);

	await waitFor(() => {
		expect(result.current.continuity).toEqual(initial);
		expect(result.current.residency.asleep.has("s1")).toBe(true);
	});
});


test("consecutive failed renames both release their projections", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s1",
		workspaces: [{
			projectId: "p1",
			shells: [{ id: "s1", label: "Shell 1", createdAt: 1, title: "Before", titleSource: "user" }],
		}],
	};
	const requests: PromiseWithResolvers<ContinuityValue>[] = [];
	const { result } = await renderSessions(initial);
	transport.mutation = () => {
		const request = Promise.withResolvers<ContinuityValue>();
		requests.push(request);
		return request.promise;
	};

	act(() => {
		result.current.renameShell("p1", "s1", "First");
		result.current.renameShell("p1", "s1", "Second");
	});
	await waitFor(() => expect(requests).toHaveLength(2));

	requests[0]?.reject(new Error("first rename failed"));
	requests[1]?.reject(new Error("second rename failed"));

	await waitFor(() => {
		expect(cached()).toEqual(initial);
	});
});


test("a failed select does not put a newer selection of the same shell to sleep", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s2",
		workspaces: [{
			projectId: "p1",
			shells: [
				{ id: "s1", label: "Shell 1", createdAt: 1, archivedAt: 2, session: SESSION },
				{ id: "s2", label: "Shell 2", createdAt: 3 },
			],
		}],
	};
	const requests: PromiseWithResolvers<ContinuityValue>[] = [];
	const { result } = await renderSessions(initial);
	transport.mutation = () => {
		const request = Promise.withResolvers<ContinuityValue>();
		requests.push(request);
		return request.promise;
	};

	act(() => {
		result.current.selectShell("p1", "s1");
		result.current.selectShell("p1", "s1");
	});
	await waitFor(() => expect(requests).toHaveLength(2));

	await act(async () => {
		requests[0]?.reject(new Error("first select failed"));
		transport.value = cached();
		requests[1]?.resolve(transport.value);
		await Promise.allSettled(requests.map((request) => request.promise));
	});

	await waitFor(() => {
		expect(result.current.continuity.selectedShellId).toBe("s1");
		expect(result.current.residency.asleep.has("s1")).toBe(false);
	});
});


test("a successful older select wakes the shell after a newer select rolls back", async () => {
	const initial: ContinuityValue = {
		selectedShellId: "s2",
		workspaces: [{
			projectId: "p1",
			shells: [
				{ id: "s1", label: "Shell 1", createdAt: 1, archivedAt: 2, session: SESSION },
				{ id: "s2", label: "Shell 2", createdAt: 3 },
			],
		}],
	};
	const requests: PromiseWithResolvers<ContinuityValue>[] = [];
	const { result } = await renderSessions(initial);
	transport.mutation = () => {
		const request = Promise.withResolvers<ContinuityValue>();
		requests.push(request);
		return request.promise;
	};

	act(() => {
		result.current.selectShell("p1", "s1");
		result.current.selectShell("p1", "s1");
	});
	await waitFor(() => expect(requests).toHaveLength(2));

	await act(async () => {
		requests[1]?.reject(new Error("newer select failed"));
		transport.value = cached();
		requests[0]?.resolve(transport.value);
		await Promise.allSettled(requests.map((request) => request.promise));
	});

	await waitFor(() => {
		expect(result.current.continuity.selectedShellId).toBe("s1");
		expect(result.current.residency.asleep.has("s1")).toBe(false);
	});
});
