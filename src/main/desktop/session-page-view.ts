import { join } from "node:path";
import { StorePaths } from "@main/store/store-paths";
import { SESSION_PAGE_IPC } from "@shared/session-page-ipc";
import {
	SessionPageSchemas,
	SessionPageUrl,
	type SessionPagePresentation,
	type SessionPageShortcut,
	type SessionPageState,
} from "@shared/session-page";
import {
	BrowserWindow,
	ipcMain,
	session,
	shell,
	WebContentsView,
	type IpcMainInvokeEvent,
	type Input,
	type NavigationEntry,
	type Rectangle,
} from "electron";

interface SessionPageSnapshot {
	entries: NavigationEntry[];
	index: number;
}

const controllers = new WeakMap<BrowserWindow, SessionPageController>();
const modifierCode = /^(?:Alt|Control|Meta|Shift)(?:Left|Right)$/;

function roundedIntersection({ bounds, container, zoom }: { bounds: Rectangle; container: Rectangle; zoom: number }): Rectangle {
	const requested = {
		x: Math.round(bounds.x * zoom),
		y: Math.round(bounds.y * zoom),
		width: Math.round(bounds.width * zoom),
		height: Math.round(bounds.height * zoom),
	};
	const containerRight = container.x + container.width;
	const containerBottom = container.y + container.height;
	const left = Math.max(requested.x, container.x);
	const top = Math.max(requested.y, container.y);
	const right = Math.min(requested.x + requested.width, containerRight);
	const bottom = Math.min(requested.y + requested.height, containerBottom);

	return {
		x: left,
		y: top,
		width: Math.max(0, right - left),
		height: Math.max(0, bottom - top),
	};
}

function controllerFor(event: IpcMainInvokeEvent) {
	const win = BrowserWindow.fromWebContents(event.sender);

	if (!win || event.sender !== win.webContents) {
		throw new Error("Session page sender is not attached to a Bankai window");
	}

	const controller = controllers.get(win);

	if (!controller) {
		throw new Error("Session page sender is not attached to a Bankai window");
	}

	return controller;
}

class SessionPageController {
	readonly pageSession: Electron.Session;
	view: WebContentsView | undefined;
	readonly histories = new Map<string, SessionPageSnapshot>();
	currentShellId: string | undefined;
	loadedNavigation: number | undefined;
	generation = 0;
	closed = false;
	failure: string | null = null;
	requestedVisible = false;
	requestedUrl: string | undefined;
	leaderArmed = false;
	transition = Promise.resolve();

	constructor(private readonly win: BrowserWindow) {
		this.pageSession = session.fromPath(join(StorePaths.dataDir(), "browser-profile"), {
			cache: false,
		});
		this.pageSession.setPermissionCheckHandler(() => false);
		this.pageSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		this.pageSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
		this.pageSession.on("will-download", (event) => event.preventDefault());
		this.view = this.createView();
		this.win.once("close", () => this.close());
	}

	private createView() {
		const view = new WebContentsView({
			webPreferences: {
				session: this.pageSession,
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				nodeIntegrationInSubFrames: false,
				webviewTag: false,
				plugins: false,
				allowRunningInsecureContent: false,
				webSecurity: true,
			},
		});
		view.setVisible(false);
		this.win.contentView.addChildView(view);

		const contents = view.webContents;
		contents.setWindowOpenHandler((details) => {
			const target = SessionPageUrl.parse(details.url);

			if (target) {
				contents.loadURL(target).catch(() => {});
			}

			return { action: "deny" };
		});
		contents.on("will-frame-navigate", (event) => {
			if (!SessionPageUrl.parse(event.url)) {
				event.preventDefault();
			}
		});
		contents.on("will-navigate", (event) => {
			if (!SessionPageUrl.parse(event.url)) {
				event.preventDefault();
			}
		});
		contents.on("will-redirect", (event) => {
			if (!SessionPageUrl.parse(event.url)) {
				event.preventDefault();
			}
		});
		contents.on("did-start-loading", () => this.publishState());
		contents.on("did-stop-loading", () => this.publishState());
		contents.on("did-finish-load", () => {
			this.failure = null;
			view.setVisible(this.requestedVisible);
			this.publishState();
		});
		contents.on("did-fail-load", (_event, _code, description, _url, isMainFrame) => {
			if (!isMainFrame) {
				return;
			}

			this.fail(description);
		});
		contents.on("render-process-gone", () => this.fail("Page process stopped"));
		contents.on("before-input-event", (event, input) => this.handleShortcut(event, input));
		contents.on("blur", () => {
			this.leaderArmed = false;
		});
		contents.on("did-navigate", () => this.publishState());
		contents.on("did-navigate-in-page", () => this.publishState());
		contents.on("page-title-updated", () => this.publishState());

		return view;
	}

	private ensureView() {
		if (!this.view) {
			this.view = this.createView();
		}

		return this.view;
	}

	async present(presentation: SessionPagePresentation | null) {
		const generation = ++this.generation;

		if (!presentation) {
			this.hide();
			return;
		}

		const transition = this.transition.then(async () => {
			if (generation !== this.generation) {
				return;
			}

			await this.applyPresentation(presentation, generation);
		});
		this.transition = transition.catch(() => {});

		await transition;
	}

	private async applyPresentation(presentation: SessionPagePresentation, generation: number) {
		const view = this.ensureView();
		const bounds = roundedIntersection({
			bounds: presentation.bounds,
			container: this.win.contentView.getBounds(),
			zoom: this.win.webContents.getZoomFactor(),
		});
		this.requestedUrl = presentation.url;
		view.setBounds(bounds);
		const hasVisibleBounds = bounds.width > 0 && bounds.height > 0;
		this.requestedVisible = hasVisibleBounds;

		if (presentation.shellId === this.currentShellId) {
			view.setVisible(hasVisibleBounds && !this.failure);

			if (this.loadedNavigation !== presentation.navigation) {
				this.loadedNavigation = presentation.navigation;
				await view.webContents.loadURL(presentation.url);
			}

			if (generation === this.generation) {
				this.publishState();
			}
			return;
		}

		view.setVisible(false);
		this.win.webContents.focus();
		this.saveCurrentHistory();
		this.currentShellId = presentation.shellId;
		this.loadedNavigation = presentation.navigation;
		const snapshot = this.histories.get(presentation.shellId);

		try {
			if (snapshot) {
				await view.webContents.navigationHistory.restore(snapshot);
			} else {
				await view.webContents.loadURL(presentation.url);
			}
		} catch (err) {
			if (generation !== this.generation) {
				return;
			}

			throw err;
		}

		if (generation === this.generation) {
			this.failure = null;
			view.setVisible(hasVisibleBounds);
			this.publishState();
		}
	}

	release(shellId: string) {
		this.histories.delete(shellId);

		if (shellId !== this.currentShellId) {
			return;
		}

		this.currentShellId = undefined;
		this.loadedNavigation = undefined;
		this.requestedUrl = undefined;
		this.generation += 1;
		this.requestedVisible = false;
		this.closeView();
		this.win.webContents.focus();
		this.publishState();
	}

	goBack() {
		if (!this.currentShellId || !this.view?.webContents.navigationHistory.canGoBack()) {
			return;
		}

		this.view.webContents.navigationHistory.goBack();
		this.publishState();
	}

	goForward() {
		if (!this.currentShellId || !this.view?.webContents.navigationHistory.canGoForward()) {
			return;
		}

		this.view.webContents.navigationHistory.goForward();
		this.publishState();
	}

	reload() {
		if (!this.currentShellId || !this.view) {
			return;
		}

		this.failure = null;
		this.view.setVisible(this.requestedVisible);
		this.view.webContents.reload();
		this.publishState();
	}

	async openExternal() {
		if (!this.currentShellId || !this.view) {
			return;
		}

		const currentUrl = SessionPageUrl.parse(this.view.webContents.getURL()) ?? this.requestedUrl;

		if (currentUrl) {
			await shell.openExternal(currentUrl);
		}
	}

	async clearData() {
		await this.pageSession.clearData();

		if (this.currentShellId) {
			this.reload();
		}
	}

	async snapshot() {
		if (!this.currentShellId || !this.requestedVisible || this.failure || !this.view) {
			return null;
		}

		const image = await this.view.webContents.capturePage();

		if (image.isEmpty()) {
			return null;
		}

		return `data:image/jpeg;base64,${image.toJPEG(80).toString("base64")}`;
	}

	private hide() {
		this.requestedVisible = false;
		this.view?.setVisible(false);
		this.win.webContents.focus();
		this.publishState();
	}

	private fail(description: string) {
		if (!this.currentShellId || !this.view) {
			return;
		}

		this.failure = description;
		this.view.setVisible(false);
		this.win.webContents.focus();
		this.publishState();
	}

	private handleShortcut(event: Electron.Event, input: Input) {
		if (input.type !== "keyDown") {
			return;
		}

		if (this.leaderArmed) {
			if (modifierCode.test(input.code)) {
				return;
			}

			this.leaderArmed = false;

			if (input.code === "KeyT") {
				event.preventDefault();
				this.publishShortcut({ action: "new-shell", plain: input.shift });
				return;
			}

			const actions: Partial<Record<string, Exclude<SessionPageShortcut["action"], "jump-row" | "new-shell">>> = {
				KeyR: "toggle-review",
				KeyE: "toggle-expanded",
				KeyG: "toggle-page",
				KeyC: "open-commands",
				Comma: "open-settings",
				KeyP: "open-quick-open",
				KeyF: "toggle-fullscreen",
				KeyX: "archive-shell",
			};
			const action = actions[input.code];

			if (!action) {
				return;
			}

			event.preventDefault();
			this.publishShortcut({ action });
			return;
		}

		if (input.control && !input.alt && !input.meta && input.code === "KeyX") {
			event.preventDefault();
			this.leaderArmed = true;
			return;
		}

		if (input.alt && !input.control && !input.meta && /^Digit[1-9]$/.test(input.code)) {
			event.preventDefault();
			this.publishShortcut({ action: "jump-row", index: Number(input.code.slice(5)) - 1 });
			return;
		}

		if (input.control && !input.alt && !input.meta && input.code === "Tab") {
			event.preventDefault();
			this.publishShortcut({ action: "jump-waiting" });
		}
	}

	private publishShortcut(shortcut: SessionPageShortcut) {
		this.win.webContents.send(SESSION_PAGE_IPC.shortcut, SessionPageSchemas.shortcut.assert(shortcut));
	}

	private saveCurrentHistory() {
		if (!this.currentShellId || !this.view) {
			return;
		}

		const entries = this.view.webContents.navigationHistory.getAllEntries();
		const index = this.view.webContents.navigationHistory.getActiveIndex();
		const safeEntries: NavigationEntry[] = [];

		for (const entry of entries) {
			const url = SessionPageUrl.parse(entry.url);

			if (!url) {
				return;
			}

			safeEntries.push({ ...entry, url });
		}

		if (safeEntries.length === 0 || !Number.isInteger(index) || index < 0 || index >= safeEntries.length) {
			return;
		}

		this.histories.set(this.currentShellId, { entries: safeEntries, index });
	}

	private publishState() {
		let state: SessionPageState = {
			shellId: null,
			url: null,
			title: "",
			canGoBack: false,
			canGoForward: false,
			loading: false,
			failure: null,
		};

		if (this.currentShellId && this.view) {
			state = {
				shellId: this.currentShellId,
				url: SessionPageUrl.parse(this.view.webContents.getURL()) ?? null,
				title: this.view.webContents.getTitle(),
				canGoBack: this.view.webContents.navigationHistory.canGoBack(),
				canGoForward: this.view.webContents.navigationHistory.canGoForward(),
				loading: this.view.webContents.isLoading(),
				failure: this.failure,
			};
		}

		this.win.webContents.send(SESSION_PAGE_IPC.state, SessionPageSchemas.state.assert(state));
	}

	private close() {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.generation += 1;
		this.currentShellId = undefined;
		this.loadedNavigation = undefined;
		this.requestedUrl = undefined;
		this.histories.clear();
		this.closeView();
		controllers.delete(this.win);
	}

	private closeView() {
		if (!this.view) {
			return;
		}

		this.win.contentView.removeChildView(this.view);
		this.view.webContents.close({ waitForBeforeUnload: false });
		this.view = undefined;
	}
}

function setup() {
	ipcMain.handle(SESSION_PAGE_IPC.present, async (event, payload) => {
		const presentation = SessionPageSchemas.present.assert(payload);

		await controllerFor(event).present(presentation);
	});
	ipcMain.handle(SESSION_PAGE_IPC.release, (event, payload) => {
		const { shellId } = SessionPageSchemas.shellId.assert(payload);

		controllerFor(event).release(shellId);
	});
	ipcMain.handle(SESSION_PAGE_IPC.goBack, (event, payload) => {
		SessionPageSchemas.none.assert(payload);
		controllerFor(event).goBack();
	});
	ipcMain.handle(SESSION_PAGE_IPC.goForward, (event, payload) => {
		SessionPageSchemas.none.assert(payload);
		controllerFor(event).goForward();
	});
	ipcMain.handle(SESSION_PAGE_IPC.reload, (event, payload) => {
		SessionPageSchemas.none.assert(payload);
		controllerFor(event).reload();
	});
	ipcMain.handle(SESSION_PAGE_IPC.openExternal, async (event, payload) => {
		SessionPageSchemas.none.assert(payload);
		await controllerFor(event).openExternal();
	});
	ipcMain.handle(SESSION_PAGE_IPC.clearData, async (event, payload) => {
		SessionPageSchemas.none.assert(payload);
		await controllerFor(event).clearData();
	});
	ipcMain.handle(SESSION_PAGE_IPC.snapshot, async (event, payload) => {
		SessionPageSchemas.none.assert(payload);

		return controllerFor(event).snapshot();
	});
}

function attach(win: BrowserWindow) {
	if (controllers.has(win)) {
		return;
	}

	controllers.set(win, new SessionPageController(win));
}

export const SessionPageView = {
	setup,
	attach,
};
