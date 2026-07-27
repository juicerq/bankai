import "./register-dom";
import { afterEach, expect, mock, test } from "bun:test";

const webglInstances: MockWebglAddon[] = [];

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
	loadAddon() {}
	open() {}
	focus() {}
	write() {}
	onData() {
		return { dispose() {} };
	}
	dispose() {}
}

void mock.module("@xterm/xterm", () => ({ Terminal: MockTerminal }));
void mock.module("@xterm/addon-fit", () => ({ FitAddon: MockFitAddon }));
void mock.module("@xterm/addon-webgl", () => ({ WebglAddon: MockWebglAddon }));
void mock.module("@renderer/routes/-utils/terminal-style", () => ({ readTerminalStyle: () => ({}) }));

window.bankaiTerminal = {
	open: async () => "session-1",
	resume: async () => "session-1",
	write() {},
	resize() {},
	close() {},
	onData: () => () => {},
	onExit: () => () => {},
	onCommandError: () => () => {},
};

window.bankaiActivity = {
	watch: async () => ({ state: null, shells: {}, worktreeByShellId: {}, traceByShellId: {}, statusSinceByShellId: {} }),
	unwatch() {},
	onChanged: () => () => {},
	markViewed() {},
};

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

const { RendererTerminalSession } = await import("@renderer/routes/-utils/use-terminal-session");

async function startSession() {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const session = new RendererTerminalSession(container, {
		projectId: "project-1",
		shellId: "shell-1",
		resume: false,
		resizeDeferred: false,
		onResumeOutcome: () => {},
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));

	return session;
}

function lastWebgl() {
	const addon = webglInstances.at(-1);
	if (!addon) {
		throw new Error("no webgl addon was created");
	}

	return addon;
}

afterEach(() => {
	webglInstances.length = 0;
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
