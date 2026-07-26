import { join } from "node:path";
import { setupActivityIpc } from "@main/activity/ipc";
import { setupContinuityIpc } from "@main/continuity/ipc";
import { GitProcess } from "@main/git/GitProcess";
import { setupReviewIpc } from "@main/git/ipc";
import { startOrpcServer } from "@main/ipc";
import { Logger } from "@main/logger";
import { markStartup, scheduleStartupReport } from "@main/startup";
import { resolveInstanceIdentity } from "@main/store/paths";
import { type SettingsValue, Settings } from "@main/store/settings";
import { setupTerminalIpc } from "@main/terminal/ipc";
import { setupUpdateIpc } from "@main/update/ipc";
import { setupWindowIpc } from "@main/window/ipc";
import { app, BrowserWindow, screen } from "electron";

const here = import.meta.dirname;

let mainWindow: BrowserWindow | undefined;

process.on("uncaughtExceptionMonitor", (err) => {
	Logger.error("uncaughtException", { err: String(err), stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
	Logger.error("unhandledRejection", { reason: String(reason) });
	app.exit(1);
});

function visibleBounds(bounds: SettingsValue["windowBounds"]): SettingsValue["windowBounds"] {
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
	const settings = await Settings.get().catch(
		(err): SettingsValue => {
			Logger.error("settings:read-failed", { err: String(err) });
			return {};
		},
	);
	markStartup("settings-read");

	const saved = visibleBounds(settings.windowBounds);

	const win = new BrowserWindow({
		width: saved?.width ?? 1440,
		height: saved?.height ?? 900,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: "#060606",
		x: saved?.x,
		y: saved?.y,
		frame: false,
		webPreferences: {
			preload: join(here, "../preload/index.cjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow = win;
	markStartup("window-created");
	win.webContents.once("did-finish-load", () => markStartup("content-loaded"));
	win.once("ready-to-show", () => {
		markStartup("ready-to-show");
		scheduleStartupReport();
	});

	if (saved?.maximized) {
		win.maximize();
	}

	const saveBounds = debounce(() => {
		Settings.update({
			windowBounds: {
				...win.getNormalBounds(),
				maximized: win.isMaximized(),
			},
		}).catch((err) =>
			Logger.error("settings:windowBounds-save-failed", { err: String(err) }),
		);
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
	markStartup("app-ready");
	try {
		startOrpcServer();
		setupReviewIpc();
		setupActivityIpc();
		setupContinuityIpc();
		setupTerminalIpc();
		setupWindowIpc();
		setupUpdateIpc();
		markStartup("ipc-ready");
		await createWindow();
	} catch (err) {
		Logger.error("startup:failed", { err: String(err) });
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

markStartup("main-module");

const identity = resolveInstanceIdentity({
	packaged: app.isPackaged,
	prodUserDataDir: app.getPath("userData"),
});

app.setPath("userData", identity.userDataDir);

if (identity.desktopName) {
	app.setDesktopName(identity.desktopName);
}

if (identity.singleInstanceLock && !app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", focusMainWindow);
	app.on("ready", start);
	app.on("before-quit", () => GitProcess.close());
	app.on("window-all-closed", () => app.quit());
}
