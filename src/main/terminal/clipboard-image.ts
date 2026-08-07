import { randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { app, clipboard } from "electron";
import { AtomicFile } from "@main/infra/atomic-file";
import { Logger } from "@main/infra/logger";

const KEEP_MS = 24 * 60 * 60 * 1000;

function directory(): string {
	return join(app.getPath("userData"), "clipboard");
}

async function prune(dir: string): Promise<void> {
	const entries = await readdir(dir);
	const cutoff = Date.now() - KEEP_MS;

	for (const entry of entries) {
		const path = join(dir, entry);
		const info = await stat(path).catch(() => null);

		if (info && info.mtimeMs < cutoff) {
			await rm(path, { force: true });
		}
	}
}

async function saveClipboardImage(): Promise<string | null> {
	const image = clipboard.readImage();

	if (image.isEmpty()) {
		return null;
	}

	const dir = directory();
	const path = join(dir, `${randomUUID()}.png`);
	await AtomicFile.write(path, image.toPNG());

	prune(dir).catch((err) => Logger.warn("clipboard:prune-failed", { err: String(err) }));

	return path;
}

export const ClipboardImage = {
	save: saveClipboardImage,
};
