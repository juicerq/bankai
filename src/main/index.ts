import { join } from "node:path";
import { DaemonMain } from "@main/daemon/daemon-main";
import { Logger } from "@main/infra/logger";
import { Startup } from "@main/startup";
import { StorePaths } from "@main/store/store-paths";
import { ShellPorts } from "@main/terminal/shell-ports";
import { ThemeSettings } from "@main/settings/theme-settings";
import { DaemonClient } from "@main/desktop/daemon-client";
import { UpdateIpc } from "@main/desktop/update-ipc";
import { DaemonIpc } from "@main/desktop/daemon-ipc";
import { DesktopAttention } from "@main/desktop/desktop-attention";
import { DesktopIpc } from "@main/desktop/desktop-ipc";
import { DesktopWindow } from "@main/desktop/desktop-window";
import { SessionPageView } from "@main/desktop/session-page-view";
import { WindowBoundsStore } from "@main/desktop/window-bounds-store";
import { DAEMON_ENV_FLAG } from "@shared/daemon";
import { AUTH_IPC } from "@shared/server";
import { SHELL_PORTS_IPC } from "@shared/shell-ports-ipc";
import type { WindowBounds } from "@shared/settings";
import { DEFAULT_THEME, resolveTheme, THEME_ARGUMENTS, THEME_BACKGROUND } from "@shared/theme";
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen } from "electron";

const here = import.meta.dirname;

let mainWindow: BrowserWindow | undefined;

process.on("uncaughtExceptionMonitor", (err) => {
	Logger.error("uncaughtException", { err: String(err), stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
	Logger.error("unhandledRejection", { reason: String(reason) });
	app.exit(1);
});

function visibleBounds(bounds: WindowBounds | undefined): WindowBounds | undefined {
	if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
		return undefined;
	}
	const { workArea } = screen.getDisplayMatching(bounds);
	const width = Math.min(Math.max(bounds.width, 900), workArea.width);
	const height = Math.min(Math.max(bounds.height, 620), workArea.height);
	return {
		x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
		y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
		width,
		height,
		maximized: bounds.maximized,
	};
}

function debounce<A extends unknown[]>(
	fn: (...args: A) => unknown,
	ms: number,
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return (...args: A) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => fn(...args), ms);
	};
}

async function createWindow() {
	const [preference, bounds] = await Promise.all([
		ThemeSettings.get().catch((err) => {
			Logger.error("settings:read-failed", { err: String(err) });

			return DEFAULT_THEME;
		}),
		WindowBoundsStore.read(),
	]);
	Startup.mark("settings-read");

	const saved = visibleBounds(bounds);
	const theme = resolveTheme(preference, () => nativeTheme.shouldUseDarkColors);

	const win = new BrowserWindow({
		width: saved?.width ?? 1440,
		height: saved?.height ?? 900,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: THEME_BACKGROUND[theme],
		x: saved?.x,
		y: saved?.y,
		frame: false,
		webPreferences: {
			preload: join(here, "../preload/index.cjs"),
			additionalArguments: [THEME_ARGUMENTS[theme]],
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow = win;
	SessionPageView.attach(win);
	const ports = ShellPorts.watch({
		send: (detected) => win.webContents.send(SHELL_PORTS_IPC.detected, detected),
		shells: DaemonClient.shells,
	});
	win.on("focus", ports.resume);
	win.on("show", ports.resume);
	win.on("blur", ports.pause);
	win.on("hide", ports.pause);
	win.once("close", ports.pause);
	DesktopAttention.setup(win);
	DesktopWindow.publishMaximized(win);
	Startup.mark("window-created");
	win.webContents.once("did-finish-load", () => Startup.mark("content-loaded"));
	win.once("ready-to-show", () => {
		Startup.mark("ready-to-show");
		Startup.scheduleReport();
	});

	if (saved?.maximized) {
		win.maximize();
	}

	const saveBounds = debounce(() => {
		WindowBoundsStore.save({
			...win.getNormalBounds(),
			maximized: win.isMaximized(),
		}).catch((err) => Logger.error("window:bounds-save-failed", { err: String(err) }));
	}, 500);

	win.on("resize", saveBounds);
	win.on("move", saveBounds);
	win.on("maximize", saveBounds);
	win.on("unmaximize", saveBounds);

	if (process.env.ELECTRON_RENDERER_URL) {
		await win.loadURL(process.env.ELECTRON_RENDERER_URL);
		win.webContents.openDevTools({ mode: "detach" });
	} else {
		await win.loadFile(join(here, "../renderer/index.html"));
	}
}

async function start() {
	Startup.mark("app-ready");
	try {
		await DaemonClient.ensure();
		ipcMain.handle(AUTH_IPC.getToken, () => DaemonClient.reach());
		Startup.mark("server-ready");

		DesktopWindow.setup();
		SessionPageView.setup();
		DesktopIpc.setup();
		DaemonIpc.setup();
		await UpdateIpc.setup();
		Startup.mark("ipc-ready");
		await createWindow();
	} catch (err) {
		Logger.error("startup:failed", { err: String(err) });
		dialog.showErrorBox("Bankai failed to start", String(err));
		app.exit(1);
	}
}

function focusMainWindow() {
	if (!mainWindow) {
		return;
	}

	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}

	mainWindow.focus();
}

Startup.mark("main-module");

const identity = StorePaths.resolveIdentity({
	packaged: app.isPackaged,
	prodUserDataDir: app.getPath("userData"),
});

app.setPath("userData", identity.userDataDir);

if (identity.desktopName) {
	app.setDesktopName(identity.desktopName);
}

if (process.env[DAEMON_ENV_FLAG] === "1") {
	DaemonMain.start().catch((err) => {
		Logger.error("daemon:start-failed", { err: String(err) });
		app.exit(1);
	});
} else if (identity.singleInstanceLock && !app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", focusMainWindow);
	app.on("ready", () => {
		start().catch((err) => Logger.error("app:start-failed", { err: String(err) }));
	});
	app.on("window-all-closed", () => app.quit());
}
