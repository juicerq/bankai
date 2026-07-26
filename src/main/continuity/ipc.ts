import { ipcMain, type WebContents } from "electron";
import { Logger } from "@main/logger";
import { Continuity, type ContinuityValue } from "@main/store/continuity";
import { CONTINUITY_IPC, type ContinuityChangedEvent } from "@shared/continuity";

const subscribers = new Map<number, () => void>();

export function setupContinuityIpc(): void {
	ipcMain.on(CONTINUITY_IPC.subscribe, (event) => {
		subscribe(event.sender);

		Continuity.load()
			.then(({ value }) => push(event.sender, value))
			.catch((err) => Logger.error("continuity:seed-failed", { err: String(err) }));
	});
}

function subscribe(sender: WebContents): void {
	subscribers.get(sender.id)?.();

	const stop = Continuity.subscribe((value) => push(sender, value));
	subscribers.set(sender.id, stop);

	const unsubscribe = () => {
		if (subscribers.get(sender.id) !== stop) {
			return;
		}

		stop();
		subscribers.delete(sender.id);
	};

	sender.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
		if (isMainFrame) {
			unsubscribe();
		}
	});
	sender.on("render-process-gone", unsubscribe);
	sender.once("destroyed", unsubscribe);
}

function push(sender: WebContents, value: ContinuityValue): void {
	if (sender.isDestroyed()) {
		return;
	}

	try {
		sender.send(CONTINUITY_IPC.changed, { value } satisfies ContinuityChangedEvent);
	} catch (err) {
		Logger.error("continuity:push-failed", { err: String(err) });
	}
}
