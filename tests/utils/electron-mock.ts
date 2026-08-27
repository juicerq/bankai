import { EventEmitter } from "node:events";
import { mock } from "bun:test";
import type { BankaiSessionPageApi } from "@shared/session-page";

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

export const ipcHandlers = new Map<string, (event: { sender: object }, payload?: unknown) => unknown>();
export const sessionPaths: string[] = [];
export const sessions: FakeSession[] = [];
export const views: FakeWebContentsView[] = [];
export const windows: FakeWindow[] = [];
export const externalUrls: string[] = [];
export const exposed = new Map<string, BankaiSessionPageApi>();
export const invoked: { channel: string; payload: unknown }[] = [];
export const errorBoxes: { title: string; content: string }[] = [];

class FakeIpcRenderer extends EventEmitter {
	async invoke(channel: string, payload?: unknown) {
		invoked.push({ channel, payload });
	}

	send() {}
}

export const ipcRenderer = new FakeIpcRenderer();

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

	constructor(private readonly onMove: (url: string) => void) {}

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
			this.onMove(this.entries[this.activeIndex]?.url ?? "");
		}
	}

	goForward() {
		if (this.canGoForward()) {
			this.activeIndex += 1;
			this.onMove(this.entries[this.activeIndex]?.url ?? "");
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
	readonly navigationHistory: FakeHistory;
	loadURLCalls: string[] = [];
	loadWaits = new Map<string, Promise<void>>();
	reloadCount = 0;
	captureCount = 0;
	focusCount = 0;
	closed = false;
	windowOpenHandler: ((details: { url: string }) => { action: string }) | undefined;

	constructor(readonly session: FakeSession) {
		super();
		this.navigationHistory = new FakeHistory((url) => this.emit("did-navigate", {}, url));
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


export const notifications: FakeNotification[] = [];

export class FakeNotification extends EventEmitter {
	shown = 0;

	constructor(readonly options: { title: string; body: string }) {
		super();
		notifications.push(this);
	}

	static isSupported = () => true;

	show() {
		this.shown += 1;
	}
}

void mock.module("electron", () => ({
	app: { name: "Bankai" },
	Notification: FakeNotification,
	BrowserWindow: FakeWindow,
	ipcMain: {
		handle: (channel: string, handler: (event: { sender: object }, payload?: unknown) => unknown) => {
			ipcHandlers.set(channel, handler);
		},
	},
	dialog: {
		showErrorBox: (title: string, content: string) => {
			errorBoxes.push({ title, content });
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
