import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterEach, expect, mock, test } from "bun:test";
import type { ILink, ILinkProvider } from "@xterm/xterm";
import { streamResync } from "@renderer/lib/stream/resync";
import {
	TerminalFileLinks,
	type TerminalFileTarget,
} from "@renderer/routes/-features/terminal/terminal-file-links";
import type { TerminalFileLinkContext } from "@renderer/routes/-features/terminal/use-terminal-session";
import type { TerminalAttached } from "@shared/terminal";
import { act, renderHook, waitFor } from "./testing-library";

const webglInstances: MockWebglAddon[] = [];
const terminals: MockTerminal[] = [];

class MockWebglAddon {
	disposed = false;
	contextLossDisposed = false;
	private contextLossHandler: (() => void) | undefined;

	constructor() {
		webglInstances.push(this);
	}

	onContextLoss(handler: () => void) {
		this.contextLossHandler = handler;
		return {
			dispose: () => {
				this.contextLossDisposed = true;
			},
		};
	}

	loseContext() {
		this.contextLossHandler?.();
	}

	dispose() {
		this.disposed = true;
	}
}

class MockFitAddon {
	fit() {}
	dispose() {}
}

class MockTerminal {
	cols = 80;
	rows = 24;
	pastes: string[] = [];
	writes: string[] = [];
	resets = 0;
	lines: string[] = [];
	wrappedLines = new Set<number>();
	linkProvider: ILinkProvider | undefined;
	readonly buffer = {
		active: {
			getLine: (index: number) => {
				const text = this.lines[index];

				if (text === undefined) {
					return;
				}

				return {
					isWrapped: this.wrappedLines.has(index),
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
	private keyEventHandler: ((event: KeyboardEvent) => boolean) | undefined;

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
	attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
		this.keyEventHandler = handler;
	}
	open() {}
	focus() {}
	handleKey(event: KeyboardEvent) {
		return this.keyEventHandler?.(event);
	}
	paste(data: string) {
		this.pastes = [...this.pastes, data];
	}
	write(data: string) {
		this.writes = [...this.writes, data];
	}
	reset() {
		this.resets += 1;
	}
	onData() {
		return { dispose() {} };
	}
	dispose() {}
}

void mock.module("@xterm/xterm", () => ({ Terminal: MockTerminal }));
void mock.module("@xterm/addon-fit", () => ({ FitAddon: MockFitAddon }));
void mock.module("@xterm/addon-webgl", () => ({ WebglAddon: MockWebglAddon }));
void mock.module("@renderer/routes/-features/terminal/terminal-style", () => ({
	registerTerminalStyle: () => () => {},
	TERMINAL_OPTIONS: {},
}));

let attached: TerminalAttached = { sessionId: "session-1" };

streamTransport.handle("terminal", "open", () => attached);
streamTransport.handle("terminal", "resume", () => attached);

Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });

globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

const idleTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextIdleId = 1;
globalThis.requestIdleCallback = (callback: IdleRequestCallback) => {
	const id = nextIdleId++;
	idleTimers.set(id, setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0));

	return id;
};
globalThis.cancelIdleCallback = (id: number) => {
	clearTimeout(idleTimers.get(id));
	idleTimers.delete(id);
};

const { RendererTerminalSession, useTerminalSession } = await import(
	"@renderer/routes/-features/terminal/use-terminal-session"
);

async function startSession(fileLinks: () => TerminalFileLinkContext | undefined = () => {}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const session = new RendererTerminalSession(container, {
		projectId: "project-1",
		shellId: "shell-1",
		resume: false,
		attachOnly: false,
		resizeDeferred: false,
		onResumeOutcome: () => {},
		onFirstOutput: () => {},
		fileLinks,
	});

	for (let tick = 0; tick < 4; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	return session;
}

function fileLinkContext(options: {
	paths: ReadonlySet<string>;
	worktree?: string;
	onOpen: (target: TerminalFileTarget) => void;
}) {
	return {
		detector: TerminalFileLinks.prepare(options),
		onOpen: options.onOpen,
	};
}

function lastWebgl() {
	const addon = webglInstances.at(-1);
	if (!addon) {
		throw new Error("no webgl addon was created");
	}

	return addon;
}

function lastTerminal() {
	const terminal = terminals.at(-1);
	if (!terminal) {
		throw new Error("no terminal was created");
	}

	return terminal;
}

function provideLinks(row: number) {
	const provider = lastTerminal().linkProvider;

	if (!provider) {
		throw new Error("no link provider was registered");
	}

	let links: ILink[] | undefined;
	provider.provideLinks(row, (result) => {
		links = result;
	});

	return links;
}

afterEach(() => {
	webglInstances.length = 0;
	terminals.length = 0;
	streamTransport.reset();
	attached = { sessionId: "session-1" };
	document.body.replaceChildren();
});

test("webgl loads once at idle after open", async () => {
	const session = await startSession();

	expect(webglInstances).toHaveLength(1);

	session.setActive(true);

	expect(webglInstances).toHaveLength(1);

	session.dispose();
});

test("deactivating a shell does not dispose its webgl", async () => {
	const session = await startSession();
	session.setActive(true);
	const addon = lastWebgl();

	session.setActive(false);

	expect(addon.disposed).toBe(false);
	expect(addon.contextLossDisposed).toBe(false);

	session.dispose();
});

test("reactivating a shell reuses the live webgl context", async () => {
	const session = await startSession();
	session.setActive(true);
	session.setActive(false);

	session.setActive(true);

	expect(webglInstances).toHaveLength(1);
	expect(lastWebgl().disposed).toBe(false);

	session.dispose();
});

test("dispose tears down the webgl context and its context-loss listener", async () => {
	const session = await startSession();
	session.setActive(true);
	const addon = lastWebgl();

	session.dispose();

	expect(addon.disposed).toBe(true);
	expect(addon.contextLossDisposed).toBe(true);
});

test("context loss disposes the lost context and the shell rebuilds on next activation", async () => {
	const session = await startSession();
	session.setActive(true);
	const lost = lastWebgl();

	lost.loseContext();

	expect(lost.disposed).toBe(true);

	session.setActive(false);
	session.setActive(true);

	expect(webglInstances).toHaveLength(2);
	expect(lastWebgl().disposed).toBe(false);

	session.dispose();
});

test("attaching to a live shell clears the screen before replaying its scrollback", async () => {
	attached = { sessionId: "session-1", replay: "earlier output" };

	const session = await startSession();

	expect(lastTerminal().resets).toBe(1);
	expect(lastTerminal().writes).toEqual(["earlier output"]);

	session.dispose();
});

test("opening a shell with nothing to replay leaves the screen untouched", async () => {
	const session = await startSession();

	expect(lastTerminal().resets).toBe(0);
	expect(lastTerminal().writes).toEqual([]);

	session.dispose();
});

test("Ctrl+Shift+V prevents the browser paste before pasting through xterm", async () => {
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { readText: async () => "clipboard text" },
	});
	const session = await startSession();
	const event = new KeyboardEvent("keydown", {
		code: "KeyV",
		ctrlKey: true,
		shiftKey: true,
		cancelable: true,
	});

	expect(lastTerminal().handleKey(event)).toBe(false);
	await Promise.resolve();

	expect(event.defaultPrevented).toBe(true);
	expect(lastTerminal().pastes).toEqual(["clipboard text"]);

	session.dispose();
});

test("unmounting detaches the connection and leaves the process running", async () => {
	const session = await startSession();

	session.dispose();

	expect(streamTransport.payloads("terminal", "detach")).toEqual([{ sessionId: "session-1" }]);
	expect(streamTransport.payloads("terminal", "close")).toEqual([]);
});

test("a reconnect reattaches the shell and repaints its scrollback", async () => {
	const session = await startSession();
	attached = { sessionId: "session-1", replay: "restored output" };

	await streamResync.run();

	expect(streamTransport.payloads("terminal", "open")).toHaveLength(2);
	expect(streamTransport.payloads("terminal", "detach")).toEqual([]);
	expect(lastTerminal().resets).toBe(1);
	expect(lastTerminal().writes).toEqual(["restored output"]);

	session.dispose();
});

test("a path printed in the shell opens the current file target and unregisters with the session", async () => {
	let firstOpened: TerminalFileTarget | undefined;
	let currentOpened: TerminalFileTarget | undefined;
	let context = fileLinkContext({
		paths: new Set(["src/a.ts"]),
		onOpen: (target: TerminalFileTarget) => {
			firstOpened = target;
		},
	});
	const session = await startSession(() => context);
	lastTerminal().lines = ["  at src/a.ts:12"];
	context = fileLinkContext({
		paths: new Set(["src/a.ts"]),
		onOpen: (target) => {
			currentOpened = target;
		},
	});

	const links = provideLinks(1) ?? [];

	expect(links).toHaveLength(1);
	expect(links[0]?.range).toEqual({ start: { x: 6, y: 1 }, end: { x: 16, y: 1 } });
	expect(links[0]?.text).toBe("src/a.ts:12");

	links[0]?.activate(new MouseEvent("click"), "src/a.ts:12");

	expect(firstOpened).toBeUndefined();
	expect(currentOpened).toEqual({ file: "src/a.ts", line: 12 });

	session.dispose();

	expect(lastTerminal().linkProvider).toBeUndefined();
});

test("a path wrapped across terminal rows remains one link from either row", async () => {
	const opened: TerminalFileTarget[] = [];
	const session = await startSession(() => fileLinkContext({
		paths: new Set(["src/my file.ts"]),
		onOpen: (target) => opened.push(target),
	}));
	const terminal = lastTerminal();
	terminal.cols = 12;
	terminal.lines = ["prefix src/m", "y file.ts:12"];
	terminal.wrappedLines.add(1);

	for (const row of [1, 2]) {
		const links = provideLinks(row) ?? [];
		const link = links.at(0);

		expect(links).toHaveLength(1);
		expect(link?.range).toEqual({ start: { x: 8, y: 1 }, end: { x: 12, y: 2 } });
		expect(link?.text).toBe("src/my file.ts:12");
	}

	const link = provideLinks(2)?.at(0);
	link?.activate(new MouseEvent("click"), link.text);

	expect(opened).toEqual([{ file: "src/my file.ts", line: 12 }]);

	session.dispose();
});

test("a shell gains file links when its current worktree paths arrive after the session starts", async () => {
	let firstOpened: TerminalFileTarget | undefined;
	let currentOpened: TerminalFileTarget | undefined;
	const initialProps: { fileLinks?: Parameters<typeof useTerminalSession>[0]["fileLinks"] } = {};
	const view = renderHook(
		({ fileLinks }: { fileLinks?: Parameters<typeof useTerminalSession>[0]["fileLinks"] }) =>
			useTerminalSession({
				projectId: "project-1",
				shellId: "shell-1",
				resizeDeferred: false,
				fileLinks,
			}),
		{ initialProps },
	);
	const container = document.createElement("div");
	const unregister = view.result.current.registerContainer(container);

	await waitFor(() => expect(terminals).toHaveLength(1));

	view.rerender({
		fileLinks: fileLinkContext({
			paths: new Set(["src/a.ts"]),
			onOpen: (target) => {
				firstOpened = target;
			},
		}),
	});
	lastTerminal().lines = ["src/a.ts:12"];
	const links = provideLinks(1) ?? [];
	view.rerender({
		fileLinks: fileLinkContext({
			paths: new Set(["src/a.ts"]),
			onOpen: (target) => {
				currentOpened = target;
			},
		}),
	});

	links[0]?.activate(new MouseEvent("click"), "src/a.ts:12");

	expect(firstOpened).toEqual({ file: "src/a.ts", line: 12 });
	expect(currentOpened).toBeUndefined();

	act(() => unregister?.());
	view.unmount();
});

test("a path missing from the current worktree stays plain text", async () => {
	const session = await startSession(() => fileLinkContext({ paths: new Set(["src/a.ts"]), onOpen: () => {} }));
	lastTerminal().lines = ["  at src/ghost.ts:12"];

	expect(provideLinks(1)).toEqual([]);

	session.dispose();
});

test("a shell without file-link context registers a provider with no links", async () => {
	const session = await startSession();

	expect(lastTerminal().linkProvider).toBeDefined();
	expect(provideLinks(1)).toEqual([]);

	session.dispose();
});

test("retrying a failed resume closes the shell it replaces", async () => {
	const session = await startSession();

	session.retryResume();

	expect(streamTransport.payloads("terminal", "close")).toEqual([{ sessionId: "session-1" }]);

	session.dispose();
});
