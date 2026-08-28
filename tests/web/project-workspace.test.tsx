import "./register-dom";
import { setTodosTransport, type TodosTransport } from "./orpc-transport";
import { streamTransport } from "./stream-transport";
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { ILink, ILinkProvider } from "@xterm/xterm";
import { Profiler, useState } from "react";
import type { Worktree } from "@shared/review";
import { LEADING_CONTEXT } from "@renderer/routes/-features/review/reading/review-focused-file";
import { REVIEW_ROW_HEIGHT } from "@renderer/routes/-features/review/reading/review-rows";
import { ProjectRailReveal } from "@renderer/routes/-features/workspace/layout/project-rail-reveal";
import { WorkspaceProvider } from "@renderer/routes/-features/workspace/layout/workspace-context";
import {
	SessionPageRegistry,
	type SessionPageRegistryValue,
} from "@renderer/routes/-features/session-page/session-page-registry";
import {
	useReviewPanelState,
	type WorkspaceBayMode,
} from "@renderer/routes/-features/review/panel/use-review-panel-state";
import { get, query, querySlot, slot } from "./dom";
import { installReviewEnvironment } from "./review-harness";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

const terminals: MockTerminal[] = [];

function installChromeApis() {
	window.bankaiUpdate = {
		getPending: async () => null,
		onDownloaded: () => () => {},
		installCost: async () => null,
		install: () => {},
	};
	window.bankaiDaemon = {
		getSkew: async () => null,
		countActiveWork: async () => ({ kind: "shells", count: 0 }),
		restart: async () => {},
	};
}

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

const project = { id: "p1", name: "p1", path: "/p1", createdAt: 0, reviewClosedTargets: [] };
const shells = [
	{ id: "s1", label: "Shell 1", createdAt: 1 },
	{ id: "s2", label: "Shell 2", createdAt: 2 },
];
const worktrees: Worktree[] = [
	{ path: "/p1", branch: "main" },
	{ path: "/p1-feature", branch: "feature" },
	{ path: "/p1-other", branch: "other" },
];

function WorkspaceHarness({
	shellWorktree,
	initialBayMode = "closed",
	fullscreen = false,
	active = true,
	registry,
	onRequestShellFocus = () => {},
	onWorkspaceRender = () => {},
}: {
	shellWorktree: string;
	initialBayMode?: WorkspaceBayMode;
	fullscreen?: boolean;
	active?: boolean;
	registry?: SessionPageRegistryValue;
	onRequestShellFocus?: () => void;
	onWorkspaceRender?: () => void;
}) {
	const [ownRegistry] = useState(SessionPageRegistry.create);
	const sessionPages = registry ?? ownRegistry;
	const reviewPanel = useReviewPanelState({
		initialOpen: initialBayMode === "review",
		initialExpanded: false,
		persist: () => {},
		onClose: () => {},
	});
	const [seeded, setSeeded] = useState(initialBayMode === "closed" || initialBayMode === "review");

	if (!seeded) {
		setSeeded(true);
		reviewPanel.changeMode(initialBayMode);
	}

	return (
		<WorkspaceProvider
			control={{
				initialDiffWidth: 648,
				initialTreeWidth: 200,
				onToggleFullscreen: () => {},
				onOpenSettings: () => {},
				onOpenCommands: () => {},
				onPersistLayout: () => {},
				onBayModeChange: (mode) => {
					if (mode !== "page") {
						sessionPages.close("s1");
					}

					reviewPanel.changeMode(mode);
				},
				onReviewExpandedChange: reviewPanel.changeExpanded,
				onToggleReviewFocus: reviewPanel.toggleFocus,
				onTreeOpenChange: () => {},
				onRequestShell: () => {},
				onRequestShellFocus,
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
			<Profiler id="workspace" onRender={onWorkspaceRender}>
				<ProjectWorkspace
					project={project}
					active={active}
					shellFocusRequest={0}
					fullscreen={fullscreen}
					fullscreenAnimating={false}
					railResizing={false}
					bayMode={reviewPanel.mode}
					reviewExpanded={reviewPanel.expanded}
					treeOpen={false}
					shells={shells}
					selectedShellId="s1"
					serviceLogOpen={false}
					sessionPages={sessionPages}
					pageObscured={false}
				/>
			</Profiler>
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

beforeEach(installChromeApis);

afterEach(() => {
	cleanup();
	setTodosTransport({ todos: [] });
	ProjectRailReveal.set(false);
	terminals.length = 0;
	streamTransport.reset();
	document.body.replaceChildren();
	delete window.bankaiSessionPage;
});

test("a file link from the active shell opens Review on that shell worktree, path, and line", async () => {
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

test("the expand shortcut opens Review expanded over the Shell from a closed bay", async () => {
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" />, { wrapper: environment.wrapper });

	expect(get("review-panel-frame").dataset.open).toBe("false");

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.keyDown(window, { key: "e", code: "KeyE" });

	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("true"));
	expect(get("review-panel-frame").dataset.expanded).toBe("true");
	expect(get("review-panel-frame").dataset.covering).toBe("true");

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.keyDown(window, { key: "e", code: "KeyE" });

	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("false"));
	expect(get("review-panel-frame").dataset.expanded).toBe("false");
});

test("a URL from the active Shell opens Page and Review takes over the shared bay", async () => {
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" />, { wrapper: environment.wrapper });
	await waitFor(() => expect(terminals).toHaveLength(2));
	const terminal = terminals[0];
	if (!terminal) {
		throw new Error("active terminal unavailable");
	}
	terminal.lines = ["https://example.com/first?token=secret#anchor"];
	let links: ILink[] | undefined;
	terminal.linkProvider?.provideLinks(1, (result) => {
		links = result;
	});
	const [pageLink] = links ?? [];
	if (!pageLink) {
		throw new Error("page link unavailable");
	}

	act(() => pageLink.activate(new MouseEvent("click"), pageLink.text));

	await waitFor(() => expect(get<HTMLInputElement>("session-page-address").value).toBe("https://example.com/first"));
	expect(document.querySelector<HTMLButtonElement>('[aria-label="Toggle session page"]')?.disabled).toBe(false);
	expect(document.querySelector<HTMLButtonElement>('[aria-label="Toggle session page"]')?.getAttribute("aria-pressed")).toBe("true");

	const reviewToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle review panel"]');
	if (!reviewToggle) {
		throw new Error("review toggle unavailable");
	}

	fireEvent.click(reviewToggle);

	await waitFor(() => expect(!!document.querySelector('[data-component="session-page-panel"]')).toBe(false));
	expect(get("review-panel-frame").dataset.open).toBe("true");
});

test("the revealed project rail freezes the Page into a snapshot it can cover", async () => {
	const presentations: unknown[] = [];
	window.bankaiSessionPage = {
		present: async (value) => {
			presentations.push(value);
		},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => "data:image/jpeg;base64,frozen",
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const measure = spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 52, 640, 480));
	const environment = installReviewEnvironment();
	render(
		<WorkspaceHarness shellWorktree="/p1-feature" fullscreen />,
		{ wrapper: environment.wrapper },
	);
	await waitFor(() => expect(terminals).toHaveLength(2));
	const terminal = terminals[0];
	if (!terminal) {
		throw new Error("active terminal unavailable");
	}
	terminal.lines = ["https://example.com/first"];
	let links: ILink[] | undefined;
	terminal.linkProvider?.provideLinks(1, (result) => {
		links = result;
	});
	const [pageLink] = links ?? [];
	if (!pageLink) {
		throw new Error("page link unavailable");
	}

	act(() => pageLink.activate(new MouseEvent("click"), pageLink.text));

	await waitFor(() => expect(presentations.at(-1)).toMatchObject({
		bounds: { x: 0, y: 52, width: 640, height: 480 },
	}));

	act(() => ProjectRailReveal.set(true));

	await waitFor(() => expect(slot(get("session-page-panel"), "frozen").getAttribute("src")).toBe(
		"data:image/jpeg;base64,frozen",
	));
	expect(presentations.at(-1)).toBeNull();

	act(() => ProjectRailReveal.set(false));

	await waitFor(() => expect(presentations.at(-1)).toMatchObject({
		bounds: { x: 0, y: 52, width: 640, height: 480 },
	}));
	expect(document.querySelector('[data-slot="frozen"]')).not.toBeNull();

	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 250));
	});

	expect(document.querySelector('[data-slot="frozen"]')).toBeNull();
	expect(presentations.at(-1)).not.toBeNull();
	measure.mockRestore();
});

test("revealing the project rail leaves the workspace untouched", async () => {
	let renders = 0;
	const environment = installReviewEnvironment();
	const view = render(
		<WorkspaceHarness shellWorktree="/p1-feature" fullscreen onWorkspaceRender={() => {
			renders += 1;
		}} />,
		{ wrapper: environment.wrapper },
	);
	await waitFor(() => expect(terminals).toHaveLength(2));
	renders = 0;

	act(() => ProjectRailReveal.set(true));
	act(() => ProjectRailReveal.set(false));

	expect(renders).toBe(0);

	view.rerender(
		<WorkspaceHarness shellWorktree="/p1-feature" onWorkspaceRender={() => {
			renders += 1;
		}} />,
	);

	expect(renders).toBeGreaterThan(0);
});

test("Page leaves no empty frame or pressed control when the selected Shell has no page", () => {
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="page" />, { wrapper: environment.wrapper });

	expect(get("review-panel-frame").dataset.open).toBe("false");
	const pageButton = document.querySelector<HTMLButtonElement>('[aria-label="Toggle session page"]');
	expect(pageButton?.disabled).toBe(false);
	expect(pageButton?.getAttribute("aria-pressed")).toBe("false");
});

test("the header opens Page blank on a Shell with no page and closing it leaves nothing behind", async () => {
	const presentations: unknown[] = [];
	const released: string[] = [];
	window.bankaiSessionPage = {
		present: async (value) => {
			presentations.push(value);
		},
		release: async (shellId) => {
			released.push(shellId);
		},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const measure = spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 52, 640, 480));
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" />, { wrapper: environment.wrapper });

	const pageButton = document.querySelector<HTMLButtonElement>('[aria-label="Toggle session page"]');
	if (!pageButton) {
		throw new Error("page toggle unavailable");
	}

	fireEvent.click(pageButton);

	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("true"));
	const address = get<HTMLInputElement>("session-page-address");
	expect(address.value).toBe("");
	expect(document.activeElement).toBe(address);
	expect(slot(get("session-page-panel"), "blank")).not.toBeNull();
	expect(document.querySelector('[data-slot="native"]')).toBeNull();
	expect(presentations).toEqual([]);

	fireEvent.input(address, { target: { value: "example.test/docs" } });
	fireEvent.keyDown(address, { key: "Enter" });

	await waitFor(() => expect(presentations.at(-1)).toMatchObject({
		url: "https://example.test/docs",
		navigation: 1,
	}));
	expect(document.querySelector('[data-slot="blank"]')).toBeNull();
	expect(released).toEqual([]);
	measure.mockRestore();
});

test("leaving Page by another route discards the blank instead of stranding it", async () => {
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.blank("s1");
	const environment = installReviewEnvironment();
	render(
		<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="page" registry={registry} />,
		{ wrapper: environment.wrapper },
	);

	expect(slot(get("session-page-panel"), "blank")).not.toBeNull();

	const reviewToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle review panel"]');
	if (!reviewToggle) {
		throw new Error("review toggle unavailable");
	}

	fireEvent.click(reviewToggle);

	await waitFor(() => expect(!!document.querySelector('[data-component="session-page-panel"]')).toBe(false));
	expect(registry.has("s1")).toBe(false);
});

test("leaving Page by another route keeps a page that reached a URL", async () => {
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("s1", "https://example.com/kept");
	const environment = installReviewEnvironment();
	render(
		<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="page" registry={registry} />,
		{ wrapper: environment.wrapper },
	);

	const reviewToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle review panel"]');
	if (!reviewToggle) {
		throw new Error("review toggle unavailable");
	}

	fireEvent.click(reviewToggle);

	await waitFor(() => expect(!!document.querySelector('[data-component="session-page-panel"]')).toBe(false));
	expect(registry.has("s1")).toBe(true);

	const pageButton = document.querySelector<HTMLButtonElement>('[aria-label="Toggle session page"]');
	if (!pageButton) {
		throw new Error("page toggle unavailable");
	}

	fireEvent.click(pageButton);

	await waitFor(() => expect(get<HTMLInputElement>("session-page-address").value).toBe("https://example.com/kept"));
	expect(document.querySelector('[data-slot="blank"]')).toBeNull();
});

test("closing Page releases the loaded browser while Review can hide without releasing it", async () => {
	const released: string[] = [];
	window.bankaiSessionPage = {
		present: async () => {},
		release: async (shellId) => {
			released.push(shellId);
		},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("s1", "https://example.com/close-me");
	const environment = installReviewEnvironment();
	render(
		<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="page" registry={registry} />,
		{ wrapper: environment.wrapper },
	);

	fireEvent.click(slot<HTMLButtonElement>(get("session-page-panel"), "close"));

	await waitFor(() => expect(released).toEqual(["s1"]));
	expect(registry.has("s1")).toBe(false);
	expect(get("review-panel-frame").dataset.open).toBe("false");
});

test("opening the Todo list takes the bay from whatever held it", async () => {
	setTodosTransport({ todos: [] });
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="review" />, { wrapper: environment.wrapper });

	const todosToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle todo list"]');
	const reviewToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle review panel"]');
	if (!todosToggle || !reviewToggle) {
		throw new Error("bay toggles unavailable");
	}

	expect(get("review-panel-frame").dataset.open).toBe("true");
	expect(reviewToggle.getAttribute("aria-expanded")).toBe("true");
	expect(query("todo-panel")).toBeNull();

	fireEvent.click(todosToggle);

	await waitFor(() => expect(query("todo-panel")).not.toBeNull());
	expect(get("review-panel-frame").dataset.open).toBe("true");
	expect(todosToggle.getAttribute("aria-pressed")).toBe("true");
	expect(reviewToggle.getAttribute("aria-expanded")).toBe("false");
	expect(document.querySelector('[data-component="session-page-panel"]')).toBeNull();

	fireEvent.click(reviewToggle);

	await waitFor(() => expect(!!query("todo-panel")).toBe(false));
	expect(todosToggle.getAttribute("aria-pressed")).toBe("false");
	expect(reviewToggle.getAttribute("aria-expanded")).toBe("true");

	fireEvent.click(todosToggle);
	await waitFor(() => expect(query("todo-panel")).not.toBeNull());

	fireEvent.click(todosToggle);

	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("false"));
	expect(query("todo-panel")).toBeNull();
});

test("the Todo list captures a written Todo and keeps it in the open list", async () => {
	const todos: TodosTransport = { todos: [] };
	setTodosTransport(todos);
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" />, { wrapper: environment.wrapper });

	const todosToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle todo list"]');
	if (!todosToggle) {
		throw new Error("todo toggle unavailable");
	}

	fireEvent.click(todosToggle);

	await waitFor(() => expect(query("todo-panel")).not.toBeNull());
	const capture = slot<HTMLInputElement>(get("todo-panel"), "capture");
	expect(document.activeElement).toBe(capture);
	await waitFor(() => expect(slot(get("todo-panel"), "blank")).not.toBeNull());

	fireEvent.keyDown(capture, { key: "Enter" });
	expect(todos.todos).toEqual([]);

	fireEvent.input(capture, { target: { value: "  drop the stale worktree  " } });
	fireEvent.keyDown(capture, { key: "Enter" });

	await waitFor(() => expect(query("todo-row")).not.toBeNull());
	expect(capture.value).toBe("");
	expect(slot(get("todo-row"), "text").textContent).toBe("drop the stale worktree");
	expect(get("todo-row").dataset.done).toBe("false");
	expect(slot(get("todo-panel"), "open-count").textContent).toBe("1 open");

	fireEvent.click(slot(get("todo-row"), "toggle"));

	await waitFor(() => expect(get("todo-row").dataset.done).toBe("true"));
	expect(slot(get("todo-panel"), "done-count").textContent).toBe("1");
	expect(slot(get("todo-panel"), "open-count").textContent).toBe("0 open");

	fireEvent.click(slot(get("todo-row"), "remove"));

	await waitFor(() => expect(!!query("todo-row")).toBe(false));
	expect(todos.todos).toEqual([]);
});

test("a Todo that fails to be written stays in the capture line and says why", async () => {
	setTodosTransport({ todos: [], saveFailure: "todos.json is read-only" });
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="todos" />, { wrapper: environment.wrapper });

	await waitFor(() => expect(query("todo-panel")).not.toBeNull());
	const capture = slot<HTMLInputElement>(get("todo-panel"), "capture");

	fireEvent.input(capture, { target: { value: "the thing I must not lose" } });
	fireEvent.keyDown(capture, { key: "Enter" });

	await waitFor(() => expect(querySlot(get("todo-panel"), "notice")).not.toBeNull());
	expect(slot(get("todo-panel"), "notice").dataset.message).toBeTruthy();
	expect(capture.value).toBe("the thing I must not lose");
	expect(query("todo-row")).toBeNull();
});

test("a Todo list that fails to be read never claims the project is empty", async () => {
	setTodosTransport({ todos: [], listFailure: "todos.json is corrupt" });
	const environment = installReviewEnvironment();
	render(<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="todos" />, { wrapper: environment.wrapper });

	await waitFor(() => expect(querySlot(get("todo-panel"), "failure")).not.toBeNull());
	expect(slot(get("todo-panel"), "failure").dataset.message).toBeTruthy();
	expect(querySlot(get("todo-panel"), "blank")).toBeNull();
	expect(slot<HTMLInputElement>(get("todo-panel"), "capture").disabled).toBe(true);
});

test("leaving a Page for the Todo list leaves the caret in the capture line", async () => {
	const shellFocusRequests: number[] = [];
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	setTodosTransport({ todos: [] });
	const registry = SessionPageRegistry.create();
	registry.open("s1", "https://example.com/leaving");
	const environment = installReviewEnvironment();
	render(
		<WorkspaceHarness
			shellWorktree="/p1-feature"
			initialBayMode="page"
			registry={registry}
			onRequestShellFocus={() => shellFocusRequests.push(1)}
		/>,
		{ wrapper: environment.wrapper },
	);

	const todosToggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle todo list"]');
	if (!todosToggle) {
		throw new Error("todo toggle unavailable");
	}

	fireEvent.click(todosToggle);

	await waitFor(() => expect(query("todo-panel")).not.toBeNull());
	expect(shellFocusRequests).toEqual([]);
	expect(document.activeElement).toBe(slot<HTMLInputElement>(get("todo-panel"), "capture"));
});

test("a Todo list whose project goes inactive stops reading and takes the caret back on return", async () => {
	setTodosTransport({ todos: [] });
	const environment = installReviewEnvironment();
	const view = render(
		<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="todos" />,
		{ wrapper: environment.wrapper },
	);

	await waitFor(() => expect(query("todo-panel")).not.toBeNull());

	view.rerender(<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="todos" active={false} />);

	expect(query("todo-panel")).toBeNull();

	view.rerender(<WorkspaceHarness shellWorktree="/p1-feature" initialBayMode="todos" />);

	await waitFor(() => expect(query("todo-panel")).not.toBeNull());
	expect(document.activeElement).toBe(slot<HTMLInputElement>(get("todo-panel"), "capture"));
});

test("closing a blank Page forgets it so the Shell goes back to having none", async () => {
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	const environment = installReviewEnvironment();
	render(
		<WorkspaceHarness shellWorktree="/p1-feature" registry={registry} />,
		{ wrapper: environment.wrapper },
	);

	const pageButton = document.querySelector<HTMLButtonElement>('[aria-label="Toggle session page"]');
	if (!pageButton) {
		throw new Error("page toggle unavailable");
	}

	fireEvent.click(pageButton);
	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("true"));
	expect(registry.has("s1")).toBe(true);

	fireEvent.click(pageButton);

	await waitFor(() => expect(get("review-panel-frame").dataset.open).toBe("false"));
	expect(document.querySelector('[data-component="session-page-panel"]')).toBeNull();
	expect(pageButton.getAttribute("aria-pressed")).toBe("false");
	expect(registry.has("s1")).toBe(false);
});
