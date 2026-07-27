import { type } from "arktype";
import { ipcMain, type WebContents } from "electron";
import { AgentActivity } from "@main/activity/AgentActivity";
import { applyHookSource } from "@main/activity/HookSource";
import { Logger } from "@main/logger";
import { liveTraceEnabled, Settings } from "@main/store/settings";
import { ACTIVITY_IPC, type ActivityChangedEvent } from "@shared/activity";

const watchSchema = type({ projectId: "string" });
const viewedSchema = type({ sessionId: "string" });

interface WatchedProject { references: number; stop: () => void }
interface RendererWatches { projects: Map<string, WatchedProject> }
const renderers = new Map<number, RendererWatches>();

export function setupActivityIpc(): void {
	AgentActivity.start();
	Settings.get()
		.then((settings) => applyHookSource(liveTraceEnabled(settings.harness)))
		.catch((err) => Logger.error("hook-source:settings-unreadable", { err: String(err) }));

	ipcMain.handle(ACTIVITY_IPC.watch, (event, raw: unknown) => {
		const { projectId } = watchSchema.assert(raw);
		const renderer = renderers.get(event.sender.id) ?? registerRenderer(event.sender);

		const watched = renderer.projects.get(projectId);
		if (watched) {
			watched.references += 1;
			return AgentActivity.getProjectSnapshot(projectId);
		}

		const stop = AgentActivity.subscribe(projectId, (snapshot) => {
			if (event.sender.isDestroyed()) {
				return;
			}
			try {
				event.sender.send(ACTIVITY_IPC.changed, { projectId, ...snapshot } satisfies ActivityChangedEvent);
			} catch (err) {
				Logger.error("activity-watch:notify-failed", { projectId, err: String(err) });
			}
		});
		renderer.projects.set(projectId, { references: 1, stop });

		return AgentActivity.getProjectSnapshot(projectId);
	});

	ipcMain.on(ACTIVITY_IPC.unwatch, (event, raw: unknown) => {
		let projectId: string;
		try {
			projectId = watchSchema.assert(raw).projectId;
		} catch (err) {
			Logger.error("activity-watch:invalid-unwatch", { err: String(err) });
			return;
		}

		const renderer = renderers.get(event.sender.id);
		const watched = renderer?.projects.get(projectId);
		if (!renderer || !watched) {
			return;
		}
		watched.references -= 1;
		if (watched.references > 0) {
			return;
		}

		watched.stop();
		renderer.projects.delete(projectId);
	});

	ipcMain.on(ACTIVITY_IPC.viewed, (_event, raw: unknown) => {
		try {
			AgentActivity.markViewed(viewedSchema.assert(raw).sessionId);
		} catch (err) {
			Logger.error("activity:invalid-viewed", { err: String(err) });
		}
	});
}

function registerRenderer(sender: WebContents): RendererWatches {
	const renderer: RendererWatches = { projects: new Map() };
	renderers.set(sender.id, renderer);

	const closeWatches = () => {
		if (renderers.get(sender.id) !== renderer) {
			return;
		}
		for (const project of renderer.projects.values()) {
			project.stop();
		}
		renderer.projects.clear();
		renderers.delete(sender.id);
	};

	sender.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
		if (isMainFrame) {
			closeWatches();
		}
	});
	sender.on("render-process-gone", closeWatches);
	sender.once("destroyed", closeWatches);

	return renderer;
}
