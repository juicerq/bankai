import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import type { BankaiSessionPageApi, SessionPageState } from "@shared/session-page";
import { ProjectRailReveal } from "@renderer/routes/-features/workspace/layout/project-rail-reveal";
import { SessionPagePanel } from "@renderer/routes/-features/session-page/session-page-panel";
import { SessionPageRegistry } from "@renderer/routes/-features/session-page/session-page-registry";
import { get, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

const observers: TestResizeObserver[] = [];

class TestResizeObserver implements ResizeObserver {
	constructor(private readonly callback: ResizeObserverCallback) {
		observers.push(this);
	}

	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
	flush() {
		this.callback([], this);
	}
}

globalThis.ResizeObserver = TestResizeObserver;

const pageState = (patch: Partial<SessionPageState> = {}): SessionPageState => ({
	shellId: "shell-1",
	url: "https://example.com/path?secret=yes#anchor",
	title: "Example",
	canGoBack: false,
	canGoForward: true,
	loading: false,
	failure: null,
	...patch,
});

afterEach(() => {
	cleanup();
	ProjectRailReveal.set(false);
	observers.length = 0;
	delete window.bankaiSessionPage;
});

test("the native slot presents measured bounds once per animation frame and hides for overlays", async () => {
	const presentations: Parameters<BankaiSessionPageApi["present"]>[0][] = [];
	let focusRestores = 0;
	let stateListener: ((state: SessionPageState) => void) | undefined;
	window.bankaiSessionPage = {
		present: async (value) => {
			presentations.push(value);
		},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		snapshot: async () => null,
		onState: (listener) => {
			stateListener = listener;

			return () => {
				stateListener = undefined;
			};
		},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/path?secret=yes#anchor");
	const view = render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable={false}
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {
				focusRestores += 1;
			}}
		/>,
	);
	const nativeSlot = slot(get("session-page-panel"), "native");
	Object.defineProperty(nativeSlot, "getBoundingClientRect", {
		configurable: true,
		value: () => ({ x: 12, y: 52, width: 640, height: 480, top: 52, right: 652, bottom: 532, left: 12 }),
	});

	act(() => {
		observers.at(-1)?.flush();
		observers.at(-1)?.flush();
		window.dispatchEvent(new Event("resize"));
	});
	await waitFor(() => expect(presentations.at(-1)).toEqual({
		shellId: "shell-1",
		url: "https://example.com/path?secret=yes#anchor",
		navigation: 1,
		bounds: { x: 12, y: 52, width: 640, height: 480 },
	}));
	const visibleCalls = presentations.filter((value) => value !== null).length;
	expect(visibleCalls).toBe(1);

	act(() => stateListener?.(pageState()));
	expect(get<HTMLInputElement>("session-page-address").value).toBe("https://example.com/path");
	expect(presentations.filter((value) => value !== null)).toHaveLength(visibleCalls);
	expect(focusRestores).toBe(0);
	const hiddenCalls = presentations.filter((value) => value === null).length;
	act(() => registry.open("shell-1", "https://example.com/second"));
	await waitFor(() => expect(presentations.at(-1)).toMatchObject({
		url: "https://example.com/second",
		navigation: 2,
	}));
	expect(presentations.filter((value) => value === null)).toHaveLength(hiddenCalls);
	expect(focusRestores).toBe(0);

	view.rerender(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured
			coverable={false}
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {
				focusRestores += 1;
			}}
		/>,
	);
	await waitFor(() => expect(presentations.at(-1)).toBeNull());
});

test("covering freezes the page into a snapshot and uncovering restores it without stealing focus", async () => {
	const presentations: Parameters<BankaiSessionPageApi["present"]>[0][] = [];
	let focusRestores = 0;
	window.bankaiSessionPage = {
		present: async (value) => {
			presentations.push(value);
		},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		snapshot: async () => "data:image/jpeg;base64,frozen",
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/path");
	render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {
				focusRestores += 1;
			}}
		/>,
	);
	const nativeSlot = slot(get("session-page-panel"), "native");
	Object.defineProperty(nativeSlot, "getBoundingClientRect", {
		configurable: true,
		value: () => ({ x: 0, y: 52, width: 640, height: 480, top: 52, right: 640, bottom: 532, left: 0 }),
	});

	act(() => observers.at(-1)?.flush());
	await waitFor(() => expect(presentations.at(-1)).toMatchObject({ shellId: "shell-1" }));
	presentations.length = 0;

	act(() => ProjectRailReveal.set(true));

	await waitFor(() => expect(slot(get("session-page-panel"), "frozen").getAttribute("src")).toBe(
		"data:image/jpeg;base64,frozen",
	));
	await waitFor(() => expect(presentations.at(-1)).toBeNull());
	expect(presentations.filter((value) => value === null)).toHaveLength(1);

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
	expect(focusRestores).toBe(0);
});

test("a page that cannot be captured stays presented instead of going black", async () => {
	const presentations: Parameters<BankaiSessionPageApi["present"]>[0][] = [];
	window.bankaiSessionPage = {
		present: async (value) => {
			presentations.push(value);
		},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		snapshot: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/path");
	render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {}}
		/>,
	);
	const nativeSlot = slot(get("session-page-panel"), "native");
	Object.defineProperty(nativeSlot, "getBoundingClientRect", {
		configurable: true,
		value: () => ({ x: 0, y: 52, width: 640, height: 480, top: 52, right: 640, bottom: 532, left: 0 }),
	});

	act(() => observers.at(-1)?.flush());
	await waitFor(() => expect(presentations.at(-1)).toMatchObject({ shellId: "shell-1" }));
	const presented = presentations.at(-1);

	act(() => ProjectRailReveal.set(true));
	await act(async () => {});

	expect(document.querySelector('[data-slot="frozen"]')).toBeNull();
	expect(presentations.at(-1)).toBe(presented);
	expect(presented).toMatchObject({ bounds: { x: 0, y: 52, width: 640, height: 480 } });
});

test("the address bar navigates the presented page", async () => {
	const presentations: Parameters<BankaiSessionPageApi["present"]>[0][] = [];
	window.bankaiSessionPage = {
		present: async (value) => {
			presentations.push(value);
		},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		snapshot: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/path");
	render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable={false}
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {}}
		/>,
	);
	const nativeSlot = slot(get("session-page-panel"), "native");
	Object.defineProperty(nativeSlot, "getBoundingClientRect", {
		configurable: true,
		value: () => ({ x: 0, y: 52, width: 640, height: 480, top: 52, right: 640, bottom: 532, left: 0 }),
	});
	const address = get<HTMLInputElement>("session-page-address");

	fireEvent.focus(address);
	fireEvent.input(address, { target: { value: "other.test/docs" } });
	fireEvent.keyDown(address, { key: "Enter" });

	await waitFor(() => expect(presentations.at(-1)).toMatchObject({
		url: "https://other.test/docs",
		navigation: 2,
	}));
	expect(address.value).toBe("https://other.test/docs");
});

test("the header marks a local address and pulses the reload action while the page loads", () => {
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "http://localhost:5000/");
	registry.update(pageState({ url: "http://localhost:5000/", loading: true }));

	render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable={false}
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {}}
		/>,
	);

	const panel = get("session-page-panel");

	expect(slot(panel, "origin").dataset.origin).toBe("local");
	expect(panel.querySelector('[data-loading="true"]')).not.toBeNull();
});

test("the header marks a secure address and rests the reload action when idle", () => {
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/path");
	registry.update(pageState());

	render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable={false}
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {}}
		/>,
	);

	const panel = get("session-page-panel");

	expect(slot(panel, "origin").dataset.origin).toBe("secure");
	expect(panel.querySelector('[data-loading="true"]')).toBeNull();
});

test("failure replaces the guest with retry and external actions", async () => {
	let reloads = 0;
	let external = 0;
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {
			reloads += 1;
		},
		openExternal: async () => {
			external += 1;
		},
		snapshot: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/");
	registry.update(pageState({ failure: "NAME_NOT_RESOLVED" }));

	render(
		<SessionPagePanel
			registry={registry}
			shellId="shell-1"
			obscured={false}
			coverable={false}
			expanded={false}
			onToggleExpanded={() => {}}
			onRestoreTerminalFocus={() => {}}
		/>,
	);

	expect(get("session-page-failure").textContent).toContain("NAME_NOT_RESOLVED");
	fireEvent.click(slot(get("session-page-failure"), "retry"));
	fireEvent.click(slot(get("session-page-failure"), "external"));

	expect(reloads).toBe(1);
	expect(external).toBe(1);
});
