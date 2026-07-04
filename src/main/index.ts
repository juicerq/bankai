import { join } from "node:path";
import { setupAutoUpdate } from "@main/auto-update";
import { startOrpcServer } from "@main/ipc";
import { Logger } from "@main/logger";
import { type SettingsValue, Settings } from "@main/store/settings";
import { app, BrowserWindow } from "electron";

const here = import.meta.dirname;

process.on("uncaughtException", (err) => {
	Logger.error("uncaughtException", { err: String(err), stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
	Logger.error("unhandledRejection", { reason: String(reason) });
});

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
			return { theme: "system" };
		},
	);

	const saved = settings.windowBounds;

	const win = new BrowserWindow({
		width: saved?.width ?? 1024,
		height: saved?.height ?? 768,
		x: saved?.x,
		y: saved?.y,
		frame: true,
		webPreferences: {
			preload: join(here, "../preload/index.cjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
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

	if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
		win.loadURL(process.env.ELECTRON_RENDERER_URL);
		win.webContents.openDevTools({ mode: "detach" });
	} else {
		win.loadFile(join(here, "../renderer/index.html"));
	}
}

await app.whenReady();
startOrpcServer();
setupAutoUpdate();

try {
	await createWindow();
} catch (err) {
	Logger.error("createWindow:failed", { err: String(err) });
}

app.on("window-all-closed", () => app.quit());
