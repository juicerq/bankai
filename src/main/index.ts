import { join } from "node:path";
import { AgentActivity } from "@main/agents/agent-activity";
import { ClaudeHooks } from "@main/agents/harness/claude/claude-hooks";
import { GitProcess } from "@main/git/git-process";
import { Logger } from "@main/infra/logger";
import { BankaiServer } from "@main/transport/server/bankai-server";
import { Reach } from "@main/transport/server/server-reach";
import { Services } from "@main/services";
import { Startup } from "@main/startup";
import { StorePaths } from "@main/store/store-paths";
import { ShellAgents } from "@main/terminal/shell-agents";
import { ShellPorts } from "@main/terminal/shell-ports";
import { shellProcesses } from "@main/terminal/shell-processes";
import { type WindowStartupSettings, WindowSettings } from "@main/settings/window-settings";
import { MobileAccess } from "@main/infra/tailscale/mobile-access";
import { UpdateIpc } from "@main/desktop/update-ipc";
import { DesktopAttention } from "@main/desktop/desktop-attention";
import { DesktopIpc } from "@main/desktop/desktop-ipc";
import { DesktopWindow } from "@main/desktop/desktop-window";
import { SessionPageView } from "@main/desktop/session-page-view";
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
	const settings = await WindowSettings.startup().catch(
		(err): WindowStartupSettings => {
			Logger.error("settings:read-failed", { err: String(err) });
			return { theme: DEFAULT_THEME };
		},
	);
	Startup.mark("settings-read");

	const saved = visibleBounds(settings.windowBounds);
	const theme = resolveTheme(settings.theme, () => nativeTheme.shouldUseDarkColors);

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
	const ports = ShellPorts.watch((detected) => win.webContents.send(SHELL_PORTS_IPC.detected, detected));
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
		WindowSettings.update({
				...win.getNormalBounds(),
				maximized: win.isMaximized(),
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
	Startup.mark("app-ready");
	try {
		await BankaiServer.startLoopback();
		ipcMain.handle(AUTH_IPC.getToken, () => Reach.current());
		Startup.mark("server-ready");

		MobileAccess.restore().catch((err) => {
			Logger.warn("tailscale:tailnet-restore-failed", { err: String(err) });
		});

		AgentActivity.start();
		ClaudeHooks.removeInstalled().catch((err) => {
			Logger.warn("hooks:removal-failed", { err: String(err) });
		});
		Services.autostart().catch((err) => Logger.error("services:autostart-failed", { err: String(err) }));
		DesktopWindow.setup();
		SessionPageView.setup();
		DesktopIpc.setup();
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

let quitting = false;

if (identity.singleInstanceLock && !app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", focusMainWindow);
	app.on("ready", () => {
		start().catch((err) => Logger.error("app:start-failed", { err: String(err) }));
	});
	app.on("before-quit", (event) => {
		if (quitting) {
			return;
		}

		quitting = true;
		event.preventDefault();

		Services.stopAll();
		GitProcess.close();
		AgentActivity.stop();

		ShellAgents.terminate({ shells: shellProcesses.noteShutdown() })
			.catch((err) => Logger.error("app:shell-shutdown-failed", { err: String(err) }))
			.finally(() => app.quit());
	});
	app.on("window-all-closed", () => app.quit());
}
