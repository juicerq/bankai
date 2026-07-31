import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

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
void mock.module("@renderer/routes/-utils/terminal-style", () => ({ readTerminalStyle: () => ({}) }));

let resumeOutcomes: ("resolve" | "reject")[] = [];
let openCalls = 0;
let resumeCalls = 0;

streamTransport.handle("terminal", "open", () => {
	openCalls += 1;

	return { sessionId: `open-${openCalls}` };
});

streamTransport.handle("terminal", "resume", () => {
	resumeCalls += 1;
	if (resumeOutcomes.shift() === "reject") {
		throw new Error("resume failed");
	}

	return { sessionId: `resume-${resumeCalls}` };
});

Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });

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

const { TerminalPane } = await import("@renderer/routes/-components/terminal-pane");

function renderPane(resumeOnMount: boolean) {
	return render(
		<TerminalPane
			projectId="p1"
			shellId="s1"
			active
			focusRequest={0}
			resizeDeferred={false}
			resumeOnMount={resumeOnMount}
		/>,
	);
}

beforeEach(() => {
	resumeOutcomes = [];
	openCalls = 0;
	resumeCalls = 0;
	streamTransport.reset();
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

test("a resumable shell attempts resume and shows no notice on success", async () => {
	resumeOutcomes = ["resolve"];
	renderPane(true);

	await waitFor(() => {
		expect(resumeCalls).toBe(1);
	});

	expect(query("resume-notice")).toBeNull();
	expect(openCalls).toBe(0);
});

test("a failed resume falls back to a new shell and offers a single retry that can recover", async () => {
	resumeOutcomes = ["reject", "resolve"];
	renderPane(true);

	await waitFor(() => {
		expect(get("resume-notice").dataset.variant).toBe("failed-retryable");
	});
	expect(slot(get("resume-notice"), "reason").textContent).toBe("resume failed");
	expect(openCalls).toBe(1);

	fireEvent.click(slot(get("resume-notice"), "retry"));

	await waitFor(() => {
		expect(resumeCalls).toBe(2);
	});
	expect(query("resume-notice")).toBeNull();
	expect(openCalls).toBe(1);
});

test("a shell with no session ref never attempts resume", async () => {
	renderPane(false);

	await waitFor(() => {
		expect(openCalls).toBe(1);
	});

	expect(resumeCalls).toBe(0);
	expect(query("resume-notice")).toBeNull();
});

test("a resuming shell is marked until the agent paints its first line", async () => {
	resumeOutcomes = ["resolve"];
	renderPane(true);

	await waitFor(() => {
		expect(resumeCalls).toBe(1);
	});

	expect(query("resuming-mark")).not.toBeNull();

	await act(async () => {
		streamTransport.push("terminal", "data", { sessionId: "resume-1", data: "welcome back" });
	});

	expect(query("resuming-mark")).toBeNull();
});

test("a shell opening fresh is never marked as resuming", async () => {
	renderPane(false);

	await waitFor(() => {
		expect(openCalls).toBe(1);
	});

	expect(query("resuming-mark")).toBeNull();
});

test("unmounting the pane detaches without killing the shell it opened", async () => {
	const { unmount } = renderPane(false);

	await waitFor(() => {
		expect(openCalls).toBe(1);
	});

	unmount();

	expect(streamTransport.payloads("terminal", "detach")).toEqual([{ sessionId: "open-1" }]);
	expect(streamTransport.payloads("terminal", "close")).toEqual([]);
});
