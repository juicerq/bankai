import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function atomicWrite(path: string, content: string | Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp.${process.pid}`;
	await writeFile(tmp, content);
	await rename(tmp, path);
}

export const AtomicFile = {
	write: atomicWrite,
};
