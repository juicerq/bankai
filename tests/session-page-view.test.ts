import { EventEmitter } from "node:events";
import { join } from "node:path";
import { beforeEach, expect, mock, test } from "bun:test";
import { SESSION_PAGE_IPC } from "@shared/session-page-ipc";
import type { BankaiSessionPageApi } from "@shared/session-page";
import { assertDefined } from "./utils/assertions";

interface Entry {
	title: string;
	url: string;
	pageState?: string;
}

interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

const ipcHandlers = new Map<string, (event: { sender: object }, payload?: unknown) => unknown>();
const sessionPaths: string[] = [];
const sessions: FakeSession[] = [];
const views: FakeWebContentsView[] = [];
const windows: FakeWindow[] = [];
const externalUrls: string[] = [];
const exposed = new Map<string, BankaiSessionPageApi>();
const invoked: { channel: string; payload: unknown }[] = [];

class FakeIpcRenderer extends EventEmitter {
	async invoke(channel: string, payload?: unknown) {
		invoked.push({ channel, payload });
	}

	send() {}
}

const ipcRenderer = new FakeIpcRenderer();

class FakeSession extends EventEmitter {
	clearDataCalls = 0;
	permissionRequest: ((contents: object, permission: string, callback: (allowed: boolean) => void) => void) | undefined;
	permissionCheck: ((contents: object, permission: string, origin: string) => boolean) | undefined;
	displayMedia: ((request: object, callback: (streams: object) => void) => void) | undefined;

	setPermissionRequestHandler(handler: typeof this.permissionRequest) {
		this.permissionRequest = handler;
	}

	setPermissionCheckHandler(handler: typeof this.permissionCheck) {
		this.permissionCheck = handler;
	}

	setDisplayMediaRequestHandler(handler: typeof this.displayMedia) {
		this.displayMedia = handler;
	}

	async clearData() {
		this.clearDataCalls += 1;
	}
}

class FakeHistory {
	entries: Entry[] = [];
	activeIndex = -1;
	restoreCalls: { entries: Entry[]; index?: number }[] = [];
	waitForRestore: Promise<void> | undefined;

	getAllEntries() {
		return this.entries.map((entry) => ({ ...entry }));
	}

	getActiveIndex() {
		return this.activeIndex;
	}

	canGoBack() {
		return this.activeIndex > 0;
	}

	canGoForward() {
		return this.activeIndex >= 0 && this.activeIndex < this.entries.length - 1;
	}

	goBack() {
		if (this.canGoBack()) {
			this.activeIndex -= 1;
		}
	}

	goForward() {
		if (this.canGoForward()) {
			this.activeIndex += 1;
		}
	}

	clear() {
		this.entries = [];
		this.activeIndex = -1;
	}

	async restore(snapshot: { entries: Entry[]; index?: number }) {
		this.restoreCalls.push(snapshot);
		await this.waitForRestore;
		this.entries = snapshot.entries.map((entry) => ({ ...entry }));
		this.activeIndex = snapshot.index ?? snapshot.entries.length - 1;
	}
}

class FakeWebContents extends EventEmitter {
	readonly navigationHistory = new FakeHistory();
	loadURLCalls: string[] = [];
	loadWaits = new Map<string, Promise<void>>();
	reloadCount = 0;
	captureCount = 0;
	focusCount = 0;
	closed = false;
	windowOpenHandler: ((details: { url: string }) => { action: string }) | undefined;

	constructor(readonly session: FakeSession) {
		super();
	}

	async loadURL(url: string) {
		this.loadURLCalls.push(url);
		await this.loadWaits.get(url);
		this.navigationHistory.entries = [
			...this.navigationHistory.entries.slice(0, this.navigationHistory.activeIndex + 1),
			{ title: url, url },
		];
		this.navigationHistory.activeIndex = this.navigationHistory.entries.length - 1;
		this.emit("did-navigate", {}, url, 200, "OK");
	}

	getURL() {
		return this.navigationHistory.entries[this.navigationHistory.activeIndex]?.url ?? "";
	}

	getTitle() {
		return this.navigationHistory.entries[this.navigationHistory.activeIndex]?.title ?? "";
	}

	isLoading() {
		return false;
	}

	reload() {
		this.reloadCount += 1;
	}

	async capturePage() {
		this.captureCount += 1;

		return {
			isEmpty: () => false,
			toJPEG: () => Buffer.from("frozen"),
		};
	}

	focus() {
		this.focusCount += 1;
	}

	setWindowOpenHandler(handler: typeof this.windowOpenHandler) {
		this.windowOpenHandler = handler;
	}

	close() {
		this.closed = true;
	}
}

class FakeWebContentsView {
	readonly webContents: FakeWebContents;
	bounds: Bounds | undefined;
	visible = true;
	readonly options: { webPreferences?: Record<string, unknown> };

	constructor(options: { webPreferences?: Record<string, unknown> } = {}) {
		this.options = options;
		const pageSession = options.webPreferences?.session;
		if (!(pageSession instanceof FakeSession)) {
			throw new Error("fake session unavailable");
		}

		this.webContents = new FakeWebContents(pageSession);
		views.push(this);
	}

	setBounds(bounds: Bounds) {
		this.bounds = bounds;
	}

	setVisible(visible: boolean) {
		this.visible = visible;
	}
}

class FakeContentView {
	children: FakeWebContentsView[] = [];

	addChildView(view: FakeWebContentsView) {
		this.children = [...this.children, view];
	}

	removeChildView(view: FakeWebContentsView) {
		this.children = this.children.filter((child) => child !== view);
	}

	getBounds(): Bounds {
		return { x: 0, y: 0, width: 1000, height: 700 };
	}
}

class FakeWindow extends EventEmitter {
	readonly webContents: {
		sent: { channel: string; payload: unknown }[];
		focusCount: number;
		zoomFactor: number;
		send(channel: string, payload: unknown): void;
		focus(): void;
		getZoomFactor(): number;
	} = {
		sent: [],
		focusCount: 0,
		zoomFactor: 1,
		send(channel: string, payload: unknown) {
			this.sent.push({ channel, payload });
		},
		focus() {
			this.focusCount += 1;
		},
		getZoomFactor() {
			return this.zoomFactor;
		},
	};
	readonly contentView = new FakeContentView();

	constructor() {
		super();
		windows.push(this);
	}

	static fromWebContents(sender: object) {
		return windows.find((win) => win.webContents === sender);
	}
}

void mock.module("electron", () => ({
	BrowserWindow: FakeWindow,
	ipcMain: {
		handle: (channel: string, handler: (event: { sender: object }, payload?: unknown) => unknown) => {
			ipcHandlers.set(channel, handler);
		},
	},
	session: {
		fromPath: (path: string) => {
			sessionPaths.push(path);
			const created = new FakeSession();
			sessions.push(created);
			return created;
		},
	},
	shell: {
		openExternal: async (url: string) => {
			externalUrls.push(url);
		},
	},
	WebContentsView: FakeWebContentsView,
	contextBridge: {
		exposeInMainWorld: (name: string, api: BankaiSessionPageApi) => exposed.set(name, api),
	},
	ipcRenderer,
}));

const { BrowserWindow } = await import("electron");
const { SessionPageView } = await import("@main/desktop/session-page-view");
await import("../src/preload/index");

async function invoke(win: InstanceType<typeof BrowserWindow>, channel: string, payload?: unknown) {
	const handler = ipcHandlers.get(channel);

	if (!handler) {
		throw new Error(`Missing IPC handler ${channel}`);
	}

	return await handler({ sender: win.webContents }, payload);
}

beforeEach(() => {
	sessionPaths.length = 0;
	sessions.length = 0;
	views.length = 0;
	windows.length = 0;
	externalUrls.length = 0;
	invoked.length = 0;
	ipcHandlers.clear();
	SessionPageView.setup();
});

test("preload forwards the session page contract from renderer to main", async () => {
	const api = exposed.get("bankaiSessionPage");
	if (!api) {
		throw new Error("session page API unavailable");
	}
	const presentation = {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 10, y: 20, width: 800, height: 600 },
	};

	await api?.present(presentation);
	await api?.release("shell-1");
	await api?.goBack();
	await api?.goForward();
	await api?.reload();
	await api?.openExternal();
	await api?.clearData();

	expect(invoked).toEqual([
		{ channel: SESSION_PAGE_IPC.present, payload: presentation },
		{ channel: SESSION_PAGE_IPC.release, payload: { shellId: "shell-1" } },
		{ channel: SESSION_PAGE_IPC.goBack, payload: undefined },
		{ channel: SESSION_PAGE_IPC.goForward, payload: undefined },
		{ channel: SESSION_PAGE_IPC.reload, payload: undefined },
		{ channel: SESSION_PAGE_IPC.openExternal, payload: undefined },
		{ channel: SESSION_PAGE_IPC.clearData, payload: undefined },
	]);

	let received: unknown;
	const unsubscribe = api?.onState((state) => {
		received = state;
	});
	ipcRenderer.emit(SESSION_PAGE_IPC.state, {}, {
		shellId: "shell-1",
		url: "https://example.com/",
		title: "Example",
		canGoBack: false,
		canGoForward: true,
		loading: false,
		failure: null,
	});

	expect(received).toEqual({
		shellId: "shell-1",
		url: "https://example.com/",
		title: "Example",
		canGoBack: false,
		canGoForward: true,
		loading: false,
		failure: null,
	});
	unsubscribe?.();

	let shortcut: unknown;
	const unsubscribeShortcut = api?.onShortcut((event) => {
		shortcut = event;
	});
	ipcRenderer.emit(SESSION_PAGE_IPC.shortcut, {}, { action: "jump-row", index: 2 });
	expect(shortcut).toEqual({ action: "jump-row", index: 2 });
	unsubscribeShortcut?.();
});

test("session page creates one persistent isolated deny-by-default view and closes it with its window", () => {
	const win = new BrowserWindow();

	SessionPageView.attach(win);
	SessionPageView.attach(win);

	expect(views).toHaveLength(1);
	assertDefined(process.env.DATA_DIR);
	expect(sessionPaths).toEqual([join(process.env.DATA_DIR, "browser-profile")]);
	expect(views[0]?.options.webPreferences).toMatchObject({
		sandbox: true,
		contextIsolation: true,
		nodeIntegration: false,
		nodeIntegrationInSubFrames: false,
		webviewTag: false,
		allowRunningInsecureContent: false,
		webSecurity: true,
	});
	expect(views[0]?.options.webPreferences).not.toHaveProperty("preload");
	expect(views[0]?.webContents.windowOpenHandler?.({ url: "https://example.com" })).toEqual({ action: "deny" });
	expect(sessions[0]?.permissionCheck?.({}, "media", "https://example.com")).toBe(false);
	let permissionAllowed: boolean | undefined;
	sessions[0]?.permissionRequest?.({}, "media", (allowed) => {
		permissionAllowed = allowed;
	});
	expect(permissionAllowed).toBe(false);
	let capture: object | undefined;
	sessions[0]?.displayMedia?.({}, (streams) => {
		capture = streams;
	});
	expect(capture).toEqual({});
	let downloadPrevented = false;
	sessions[0]?.emit("will-download", { preventDefault: () => {
		downloadPrevented = true;
	} }, {}, views[0]?.webContents);
	expect(downloadPrevented).toBe(true);

	win.emit("close");

	expect(win.contentView.children).toHaveLength(0);
	expect(views[0]?.webContents.closed).toBe(true);
});

test("clearing browser data removes the persistent session and reloads the visible page", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://github.com",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await invoke(win, SESSION_PAGE_IPC.clearData);

	expect(sessions[0]?.clearDataCalls).toBe(1);
	expect(views[0]?.webContents.reloadCount).toBe(1);
});

test("session page limits IPC to its window and intersects rounded bounds", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: -10.4, y: 20.6, width: 120.2, height: 800 },
	});

	expect(views[0]?.bounds).toEqual({ x: 0, y: 21, width: 110, height: 679 });
	expect(views[0]?.visible).toBe(true);
	expect(views[0]?.webContents.loadURLCalls).toEqual(["https://example.com/"]);
	expect(() => ipcHandlers.get(SESSION_PAGE_IPC.present)?.({ sender: {} }, null)).toThrow();
	expect(() =>
		ipcHandlers.get(SESSION_PAGE_IPC.present)?.(
			{ sender: win.webContents },
			{ shellId: "shell-2", url: "http://example.com", bounds: { x: 0, y: 0, width: 10, height: 10 } },
		),
	).toThrow();
});

test("a zoomed window keeps the native page over the slot the renderer measured", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	win.webContents.zoomFactor = 1.5;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 100, y: 50, width: 400, height: 300 },
	});

	expect(views[0]?.bounds).toEqual({ x: 150, y: 75, width: 600, height: 450 });

	win.webContents.zoomFactor = 0.5;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 100, y: 50, width: 400, height: 300 },
	});

	expect(views[0]?.bounds).toEqual({ x: 50, y: 25, width: 200, height: 150 });
});

test("a page popup opens in the same view only when the address is allowed", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	expect(page?.windowOpenHandler?.({ url: "https://popup.example/path" })).toEqual({ action: "deny" });
	expect(page?.loadURLCalls).toEqual(["https://example.com/", "https://popup.example/path"]);

	expect(page?.windowOpenHandler?.({ url: "http://evil.example/steal" })).toEqual({ action: "deny" });
	expect(page?.windowOpenHandler?.({ url: "file:///etc/passwd" })).toEqual({ action: "deny" });
	expect(page?.loadURLCalls).toEqual(["https://example.com/", "https://popup.example/path"]);
});

test("a file page opens another file address and a web page still cannot", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "file:///home/jui/page.html",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	expect(page?.windowOpenHandler?.({ url: "file:///home/jui/next.html" })).toEqual({ action: "deny" });
	expect(page?.loadURLCalls).toEqual(["file:///home/jui/page.html", "file:///home/jui/next.html"]);
});

test("presenting a new address in the same shell navigates and adds it to history", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://two.example",
		navigation: 2,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	expect(page?.loadURLCalls).toEqual([
		"https://one.example/",
		"https://two.example/",
	]);
	expect(page?.navigationHistory.entries.map((entry) => entry.url)).toEqual([
		"https://one.example/",
		"https://two.example/",
	]);
	expect(page?.navigationHistory.activeIndex).toBe(1);
});

test("re-presenting the same navigation keeps the page where the user left it", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;
	const presentation = {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	};

	await invoke(win, SESSION_PAGE_IPC.present, presentation);
	await page?.loadURL("https://one.example/deep");
	await invoke(win, SESSION_PAGE_IPC.present, presentation);
	await invoke(win, SESSION_PAGE_IPC.present, {
		...presentation,
		bounds: { x: 0, y: 0, width: 500, height: 400 },
	});

	expect(page?.loadURLCalls).toEqual(["https://one.example/", "https://one.example/deep"]);
	expect(page?.getURL()).toBe("https://one.example/deep");

	await invoke(win, SESSION_PAGE_IPC.present, { ...presentation, navigation: 2 });

	expect(page?.loadURLCalls).toEqual([
		"https://one.example/",
		"https://one.example/deep",
		"https://one.example/",
	]);
});

test("hiding returns focus immediately while the same shell is still navigating", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const view = views[0];
	const page = view?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	let finishNavigation = () => {};
	page?.loadWaits.set("https://two.example/", new Promise<void>((resolve) => {
		finishNavigation = resolve;
	}));
	const navigating = invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://two.example",
		navigation: 2,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await Promise.resolve();

	let hidingFinished = false;
	const hiding = invoke(win, SESSION_PAGE_IPC.present, null).then(() => {
		hidingFinished = true;
	});
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();

	expect(hidingFinished).toBe(true);
	expect(view?.visible).toBe(false);
	expect(windows[0]?.webContents.focusCount).toBeGreaterThan(0);

	finishNavigation();
	await navigating;
	await hiding;
});

test("temporarily hiding keeps the current shell page intact when shown again", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;
	const presentation = {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	};

	await invoke(win, SESSION_PAGE_IPC.present, presentation);
	await invoke(win, SESSION_PAGE_IPC.present, null);
	await invoke(win, SESSION_PAGE_IPC.present, presentation);

	expect(page?.loadURLCalls).toEqual(["https://one.example/"]);
	expect(page?.navigationHistory.restoreCalls).toHaveLength(0);
});

test("switching shells stays hidden until the latest presentation finishes", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const view = views[0];
	const page = view?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	let finishTwo = () => {};
	let finishThree = () => {};
	page?.loadWaits.set("https://two.example/", new Promise<void>((resolve) => {
		finishTwo = resolve;
	}));
	page?.loadWaits.set("https://three.example/", new Promise<void>((resolve) => {
		finishThree = resolve;
	}));

	const switchingToTwo = invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-2",
		url: "https://two.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await Promise.resolve();

	expect(view?.visible).toBe(false);

	const switchingToThree = invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-3",
		url: "https://three.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	finishTwo();
	await switchingToTwo;

	expect(view?.visible).toBe(false);

	finishThree();
	await switchingToThree;

	expect(view?.visible).toBe(true);
	expect(page?.getURL()).toBe("https://three.example/");
	expect(windows[0]?.webContents.sent.at(-1)?.payload).toMatchObject({ shellId: "shell-3" });
});

test("session page keeps independent history for each shell and release forgets it", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	if (page) {
		page.navigationHistory.entries = [
			{ title: "One", url: "https://one.example/", pageState: "one" },
			{ title: "Two", url: "https://two.example/", pageState: "two" },
		];
		page.navigationHistory.activeIndex = 1;
	}

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-2",
		url: "https://other.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	expect(page?.navigationHistory.restoreCalls.at(-1)).toEqual({
		entries: [
			{ title: "One", url: "https://one.example/", pageState: "one" },
			{ title: "Two", url: "https://two.example/", pageState: "two" },
		],
		index: 1,
	});

	await invoke(win, SESSION_PAGE_IPC.release, { shellId: "shell-1" });
	expect(page?.closed).toBe(true);

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://fresh.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	expect(views).toHaveLength(2);
	expect(views[1]?.webContents.loadURLCalls).toEqual(["https://fresh.example/"]);
});

test("session page navigation and external opening act only on the current validated address", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	if (page) {
		page.navigationHistory.entries = [
			{ title: "One", url: "https://one.example/" },
			{ title: "Two", url: "https://two.example/" },
		];
		page.navigationHistory.activeIndex = 1;
	}

	await invoke(win, SESSION_PAGE_IPC.goBack);
	await invoke(win, SESSION_PAGE_IPC.goForward);
	await invoke(win, SESSION_PAGE_IPC.reload);
	await invoke(win, SESSION_PAGE_IPC.openExternal);

	expect(page?.navigationHistory.activeIndex).toBe(1);
	expect(page?.reloadCount).toBe(1);
	expect(externalUrls).toEqual(["https://two.example/"]);

	await invoke(win, SESSION_PAGE_IPC.present, null);
	await invoke(win, SESSION_PAGE_IPC.openExternal);

	expect(views[0]?.visible).toBe(false);
	expect(externalUrls).toEqual(["https://two.example/", "https://two.example/"]);
	expect(windows[0]?.webContents.focusCount).toBeGreaterThan(0);
});

test("main-frame failures hide the native page until retry and publish a DOM-safe state", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const view = views[0];
	const page = view?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	page?.emit("did-fail-load", {}, -105, "NAME_NOT_RESOLVED", "https://example.com/", true);

	expect(view?.visible).toBe(false);
	expect(windows[0]?.webContents.sent.at(-1)?.payload).toMatchObject({
		shellId: "shell-1",
		failure: "NAME_NOT_RESOLVED",
	});

	await invoke(win, SESSION_PAGE_IPC.reload);

	expect(page?.reloadCount).toBe(1);
	expect(view?.visible).toBe(true);
	expect(windows[0]?.webContents.sent.at(-1)?.payload).toMatchObject({ failure: null });
});

test("guest keyboard handling relays only Bankai shortcut actions", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;
	const prevented: string[] = [];
	const press = (input: Record<string, unknown>) => {
		page?.emit("before-input-event", { preventDefault: () => prevented.push(String(input.code)) }, {
			type: "keyDown",
			key: "",
			code: "",
			control: false,
			alt: false,
			meta: false,
			shift: false,
			...input,
		});
	};

	press({ code: "KeyX", control: true });
	press({ code: "KeyR" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyE" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyL" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyC" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyF" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyX" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyT" });
	press({ code: "KeyX", control: true });
	press({ key: "Shift", code: "ShiftLeft", shift: true });
	press({ key: "T", code: "KeyT", shift: true });
	press({ code: "KeyX", control: true });
	press({ code: "Comma" });
	press({ code: "KeyX", control: true });
	press({ code: "KeyP" });
	press({ code: "Digit3", alt: true });
	press({ code: "Tab", control: true });

	expect(windows[0]?.webContents.sent.filter((event) => event.channel === SESSION_PAGE_IPC.shortcut).map((event) => event.payload)).toEqual([
		{ action: "toggle-review" },
		{ action: "toggle-expanded" },
		{ action: "toggle-todos" },
		{ action: "open-commands" },
		{ action: "toggle-fullscreen" },
		{ action: "archive-shell" },
		{ action: "new-shell", plain: false },
		{ action: "new-shell", plain: true },
		{ action: "open-settings" },
		{ action: "open-quick-open" },
		{ action: "jump-row", index: 2 },
		{ action: "jump-waiting" },
	]);
	expect(prevented).toHaveLength(22);
});

test("the latest shell switch wins when an earlier history restore finishes late", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-2",
		url: "https://two.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	let finishRestore = () => {};
	if (page) {
		page.navigationHistory.waitForRestore = new Promise<void>((resolve) => {
			finishRestore = resolve;
		});
	}
	const restoring = invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://one.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	await Promise.resolve();
	const latest = invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-3",
		url: "https://three.example",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});
	finishRestore();
	await restoring;
	await latest;

	expect(page?.getURL()).toBe("https://three.example/");
	expect(windows[0]?.webContents.sent.at(-1)?.payload).toMatchObject({ shellId: "shell-3" });
});

test("a snapshot freezes the visible page and stays empty once it is hidden", async () => {
	const win = new BrowserWindow();
	SessionPageView.attach(win);
	const page = views[0]?.webContents;

	await invoke(win, SESSION_PAGE_IPC.present, {
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 1,
		bounds: { x: 0, y: 0, width: 900, height: 600 },
	});

	expect(await invoke(win, SESSION_PAGE_IPC.snapshot)).toBe(
		`data:image/jpeg;base64,${Buffer.from("frozen").toString("base64")}`,
	);
	expect(page?.captureCount).toBe(1);

	await invoke(win, SESSION_PAGE_IPC.present, null);

	expect(await invoke(win, SESSION_PAGE_IPC.snapshot)).toBeNull();
	expect(page?.captureCount).toBe(1);
});
