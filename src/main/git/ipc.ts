import { type } from "arktype";
import { ipcMain, type WebContents } from "electron";
import { resolveProjectWorktree } from "@main/git/ProjectWorktrees";
import { ReviewChanges } from "@main/git/ReviewChanges";
import { Logger } from "@main/logger";
import { REVIEW_IPC, type ReviewChangedEvent } from "@shared/review";

const reviewWatchSchema = type({ projectId: "string", "worktree?": "string" });

interface WatchedProject { references: number; stop: () => void }
interface RendererWatches { projects: Map<string, WatchedProject> }
const renderers = new Map<number, RendererWatches>();

function watchKey(input: { projectId: string; worktree?: string }): string {
	return `${input.projectId}\u0000${input.worktree ?? ""}`;
}

export function setupReviewIpc(): void {
	ipcMain.handle(REVIEW_IPC.watch, async (event, raw: unknown) => {
		const input = reviewWatchSchema.assert(raw);
		const renderer = renderers.get(event.sender.id) ?? registerRenderer(event.sender);
		const path = await resolveProjectWorktree(input);
		if (event.sender.isDestroyed() || renderers.get(event.sender.id) !== renderer) {
			return;
		}

		const key = watchKey(input);
		const watched = renderer.projects.get(key);
		if (watched) {
			watched.references += 1;
			return;
		}

		const stop = ReviewChanges.subscribe(path, () => {
			if (event.sender.isDestroyed()) {
				return;
			}
			try {
				event.sender.send(REVIEW_IPC.changed, { projectId: input.projectId } satisfies ReviewChangedEvent);
			} catch (err) {
				Logger.error("review-watch:notify-failed", {
					projectId: input.projectId,
					err: String(err),
				});
			}
		});
		renderer.projects.set(key, { references: 1, stop });
	});

	ipcMain.on(REVIEW_IPC.unwatch, (event, raw: unknown) => {
		let key: string;
		try {
			key = watchKey(reviewWatchSchema.assert(raw));
		} catch (err) {
			Logger.error("review-watch:invalid-unwatch", { err: String(err) });
			return;
		}

		const renderer = renderers.get(event.sender.id);
		const watched = renderer?.projects.get(key);
		if (!renderer || !watched) {
			return;
		}
		watched.references -= 1;
		if (watched.references > 0) {
			return;
		}

		watched.stop();
		renderer.projects.delete(key);
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
