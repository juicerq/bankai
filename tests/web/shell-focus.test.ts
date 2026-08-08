import { streamTransport } from "./stream-transport";
import { afterEach, beforeAll, beforeEach, expect, jest, test } from "bun:test";
import { FOCUS_IDLE_MS, useShellFocus } from "@renderer/routes/-features/sessions/lifecycle/use-shell-focus";
import { cleanup, renderHook, waitFor } from "./testing-library";

const AWAY = { shellId: undefined };

let visible = true;
let focused = true;

Object.defineProperty(document, "visibilityState", {
	configurable: true,
	get: () => (visible ? "visible" : "hidden"),
});
document.hasFocus = () => focused;

function focusCalls() {
	return streamTransport.payloads("activity", "focus-shell");
}

beforeAll(async () => {
	const connecting = renderHook(() => useShellFocus("warm-up"));
	await waitFor(() => {
		expect(focusCalls()).toHaveLength(1);
	});
	connecting.unmount();
});

beforeEach(() => {
	visible = true;
	focused = true;
	streamTransport.reset();
});

afterEach(() => {
	cleanup();
	jest.useRealTimers();
});

test("a desk in use publishes the session on screen", () => {
	renderHook(() => useShellFocus("shell-a"));

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }]);
});

test("a client without a selected session claims nothing", () => {
	renderHook(() => useShellFocus());

	expect(focusCalls()).toEqual([]);
});

test("a hidden window releases the session", () => {
	renderHook(() => useShellFocus("shell-a"));

	visible = false;
	document.dispatchEvent(new Event("visibilitychange"));

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }, AWAY]);
});

test("a window that lost focus releases the session", () => {
	renderHook(() => useShellFocus("shell-a"));

	focused = false;
	window.dispatchEvent(new Event("blur"));

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }, AWAY]);
});

test("a desk nobody touched releases the session, and input takes it back", () => {
	jest.useFakeTimers();
	renderHook(() => useShellFocus("shell-a"));

	jest.advanceTimersByTime(FOCUS_IDLE_MS);

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }, AWAY]);

	document.dispatchEvent(new Event("keydown"));

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }, AWAY, { shellId: "shell-a" }]);
});

test("moving the mouse on the same session says nothing new", () => {
	renderHook(() => useShellFocus("shell-a"));

	document.dispatchEvent(new Event("pointermove"));
	document.dispatchEvent(new Event("pointermove"));

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }]);
});

test("selecting another session moves the focus with it", () => {
	const view = renderHook(({ shellId }) => useShellFocus(shellId), {
		initialProps: { shellId: "shell-a" },
	});

	view.rerender({ shellId: "shell-b" });

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }, AWAY, { shellId: "shell-b" }]);
});

test("a client that goes away releases the session", () => {
	const view = renderHook(() => useShellFocus("shell-a"));

	view.unmount();

	expect(focusCalls()).toEqual([{ shellId: "shell-a" }, AWAY]);
});
