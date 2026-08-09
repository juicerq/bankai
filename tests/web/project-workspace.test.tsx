import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterEach, expect, mock, test } from "bun:test";
import type { ILink, ILinkProvider } from "@xterm/xterm";
import { useState } from "react";
import type { BankaiUpdateApi } from "@shared/update";
import type { Worktree } from "@shared/review";
import { LEADING_CONTEXT } from "@renderer/routes/-features/review/reading/review-focused-file";
import { REVIEW_ROW_HEIGHT } from "@renderer/routes/-features/review/reading/review-rows";
import { WorkspaceProvider } from "@renderer/routes/-features/workspace/layout/workspace-context";
import { get, slot } from "./dom";
import { installReviewEnvironment } from "./review-harness";
import { act, cleanup, render, waitFor } from "./testing-library";

const terminals: MockTerminal[] = [];

class MockAddon {
	fit() {}
	onContextLoss() {
		return { dispose() {} };
	}
	loadAddon() {}
	dispose() {}
}

class MockTerminal {
	cols = 80;
	rows = 24;
	lines: string[] = [];
	linkProvider: ILinkProvider | undefined;
	readonly buffer = {
		active: {
			getLine: (index: number) => {
				const text = this.lines[index];

				if (text === undefined) {
					return;
				}

					return {
						isWrapped: false,
						length: this.cols,
						translateToString: (trimRight = false) => (trimRight ? text.trimEnd() : text.padEnd(this.cols)),
						getCell: (column: number) => {
							if (column >= this.cols) {
								return;
							}

							const chars = text[column] ?? "";

							return { getChars: () => chars, getWidth: () => 1 };
						},
					};
				},
		},
	};

	constructor() {
		terminals.push(this);
	}

	registerLinkProvider(provider: ILinkProvider) {
		this.linkProvider = provider;

		return {
			dispose: () => {
				this.linkProvider = undefined;
			},
		};
	}

	loadAddon() {}
	attachCustomKeyEventHandler() {}
	open() {}
	focus() {}
	write() {}
	reset() {}
	onData() {
		return { dispose() {} };
	}
	dispose() {}
}

void mock.module("@xterm/xterm", () => ({ Terminal: MockTerminal }));
void mock.module("@xterm/addon-fit", () => ({ FitAddon: MockAddon }));
void mock.module("@xterm/addon-webgl", () => ({ WebglAddon: MockAddon }));
void mock.module("@renderer/routes/-features/terminal/terminal-style", () => ({
	registerTerminalStyle: () => () => {},
	TERMINAL_OPTIONS: {},
}));

Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
Object.defineProperty(window, "matchMedia", {
	configurable: true,
	value: () => ({ matches: true }),
});

globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextFrameId = 1;
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
	const id = nextFrameId++;
	frameTimers.set(id, setTimeout(() => callback(performance.now()), 0));

	return id;
};
globalThis.cancelAnimationFrame = (id: number) => {
	clearTimeout(frameTimers.get(id));
	frameTimers.delete(id);
};

globalThis.requestIdleCallback = () => 1;
globalThis.cancelIdleCallback = () => {};

streamTransport.handle("terminal", "open", ({ shellId }: { shellId: string }) => ({ sessionId: `session-${shellId}` }));

const { ProjectWorkspace } = await import(
	"@renderer/routes/-features/workspace/surface/project-workspace"
);

const project = { id: "p1", name: "p1", path: "/p1", createdAt: 0 };
const shells = [
	{ id: "s1", label: "Shell 1", createdAt: 1 },
	{ id: "s2", label: "Shell 2", createdAt: 2 },
];
const worktrees: Worktree[] = [
	{ path: "/p1", branch: "main" },
	{ path: "/p1-feature", branch: "feature" },
	{ path: "/p1-other", branch: "other" },
];

function WorkspaceHarness({ shellWorktree }: { shellWorktree: string }) {
	const [reviewOpen, setReviewOpen] = useState(false);

	return (
		<WorkspaceProvider
			control={{
				initialDiffWidth: 648,
				initialTreeWidth: 200,
				onToggleFullscreen: () => {},
				onOpenSettings: () => {},
				onOpenCommands: () => {},
				onPersistLayout: () => {},
				onReviewOpenChange: setReviewOpen,
				onReviewExpandedChange: () => {},
				onToggleReviewFocus: () => {},
				onTreeOpenChange: () => {},
				onRequestShell: () => {},
			}}
			agents={{
				shells: new Map(),
				worktrees: new Map([
					["s1", shellWorktree],
					["s2", "/p1-other"],
				]),
				statusSince: new Map(),
				harnesses: new Map(),
			}}
			residency={{ asleep: new Set(), resumable: new Set(), wake: () => {}, sleep: () => {} }}
			topBand={{ revealed: false, onFocus: () => {}, onBlur: () => {} }}
		>
			<ProjectWorkspace
				project={project}
				active
				shellFocusRequest={0}
				fullscreen={false}
				fullscreenAnimating={false}
				railResizing={false}
				reviewOpen={reviewOpen}
				reviewExpanded={false}
				treeOpen={false}
				shells={shells}
				selectedShellId="s1"
				serviceLogOpen={false}
			/>
		</WorkspaceProvider>
	);
}

function providedFileLinks() {
	const links: ILink[] = [];

	for (const terminal of terminals) {
		terminal.lines = ["src/target.ts:40"];
		let provided: ILink[] | undefined;
		terminal.linkProvider?.provideLinks(1, (result) => {
			provided = result;
		});
		links.push(...(provided ?? []));
	}

	return links;
}

type Procedure = "worktrees" | "snapshot" | "browseFiles" | "browseFile";

async function waitForPending(environment: ReturnType<typeof installReviewEnvironment>, procedure: Procedure) {
	await waitFor(() => {
		const count = environment.transport.pendingCount(procedure);
		if (count < 1) {
			throw new Error(`${procedure} pending: ${count}`);
		}
	});
}

function resolveAll(environment: ReturnType<typeof installReviewEnvironment>, procedure: Procedure, value: unknown) {
	while (environment.transport.pendingCount(procedure) > 0) {
		environment.transport.resolve(procedure, value);
	}
}

afterEach(() => {
	cleanup();
	terminals.length = 0;
	streamTransport.reset();
	document.body.replaceChildren();
});

test("a file link from the active shell opens Review on that shell worktree, path, and line", async () => {
	const updateApi: BankaiUpdateApi = {
		getPending: async () => null,
		onDownloaded: () => () => {},
		countActiveWork: async () => ({ kind: "shells", count: 0 }),
		install: () => {},
	};
	window.bankaiUpdate = updateApi;
	const environment = installReviewEnvironment();
	const view = render(<WorkspaceHarness shellWorktree="/p1-feature" />, { wrapper: environment.wrapper });

	await waitForPending(environment, "worktrees");
	await waitForPending(environment, "browseFiles");
	expect(environment.transport.callsFor("browseFiles")).toEqual([
		{ projectId: "p1", worktree: "/p1-feature" },
	]);
	await waitFor(() => expect(terminals).toHaveLength(2));
	expect(providedFileLinks()).toEqual([]);
	resolveAll(environment, "worktrees", worktrees);
	resolveAll(environment, "browseFiles", ["src/target.ts"]);
	await waitFor(() => expect(environment.ipc.pendingWatchCount).toBe(1));
	await act(async () => environment.ipc.resolveWatch());
	await waitForPending(environment, "worktrees");
	await waitForPending(environment, "browseFiles");
	resolveAll(environment, "worktrees", worktrees);
	resolveAll(environment, "browseFiles", ["src/target.ts"]);
	await waitForPending(environment, "snapshot");
	resolveAll(environment, "snapshot", {
		state: "ready",
		files: [],
		totals: { additions: 0, deletions: 0, files: 0 },
	});
	await waitFor(() => expect(providedFileLinks()).toHaveLength(1));

	const [link] = providedFileLinks();
	if (!link) {
		throw new Error("no terminal file link was provided");
	}
	act(() => link.activate(new MouseEvent("click"), link.text));

	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("true"));
	await waitForPending(environment, "browseFile");
	expect(environment.transport.callsFor("browseFile")).toEqual([
		{ projectId: "p1", worktree: "/p1-feature", path: "src/target.ts" },
	]);

	view.rerender(<WorkspaceHarness shellWorktree="/p1-other" />);
	await waitFor(() => expect(environment.transport.callsFor("browseFiles")).toHaveLength(3));
	expect(environment.transport.callsFor("browseFile")).toEqual([
		{ projectId: "p1", worktree: "/p1-feature", path: "src/target.ts" },
	]);

	environment.transport.resolve("browseFile", {
		status: "ready",
		lines: Array.from({ length: 100 }, (_, index) => ({
			kind: "context",
			number: index + 1,
			oldNumber: index + 1,
			hunk: 0,
			content: `line ${index + 1}`,
		})),
	});

	await waitFor(() => expect(get("review-focused-file").dataset.path).toBe("src/target.ts"));
	expect(slot(get("review-focused-file"), "scroll").scrollTop).toBe(
		(39 - LEADING_CONTEXT) * REVIEW_ROW_HEIGHT.line,
	);
});
