import { type } from "arktype";
import { ipcMain, type WebContents } from "electron";
import { ReviewChanges } from "@main/git/ReviewChanges";
import { Logger } from "@main/logger";
import { Projects } from "@main/store/projects";
import { REVIEW_IPC, type ReviewChangedEvent } from "@shared/review";

const reviewWatchSchema = type({ projectId: "string" });

type WatchedProject = { references: number; stop: () => void };
type RendererWatches = { projects: Map<string, WatchedProject> };
const renderers = new Map<number, RendererWatches>();

export function setupReviewIpc(): void {
	ipcMain.handle(REVIEW_IPC.watch, async (event, raw: unknown) => {
		const { projectId } = reviewWatchSchema.assert(raw);
		const project = await Projects.find(projectId);
		if (event.sender.isDestroyed()) {
			return;
		}

		const renderer = renderers.get(event.sender.id) ?? registerRenderer(event.sender);
		const watched = renderer.projects.get(projectId);
		if (watched) {
			watched.references += 1;
			return;
		}

		const stop = ReviewChanges.subscribe(project.path, () => {
			if (!event.sender.isDestroyed()) {
				event.sender.send(REVIEW_IPC.changed, { projectId } satisfies ReviewChangedEvent);
			}
		});
		renderer.projects.set(projectId, { references: 1, stop });
	});

	ipcMain.on(REVIEW_IPC.unwatch, (event, raw: unknown) => {
		let projectId: string;
		try {
			projectId = reviewWatchSchema.assert(raw).projectId;
		} catch (err) {
			Logger.error("review-watch:invalid-unwatch", { err: String(err) });
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
}

function registerRenderer(sender: WebContents): RendererWatches {
	const renderer: RendererWatches = { projects: new Map() };
	renderers.set(sender.id, renderer);
	sender.once("destroyed", () => {
		for (const project of renderer.projects.values()) {
			project.stop();
		}
		renderers.delete(sender.id);
	});
	return renderer;
}
