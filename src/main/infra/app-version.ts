import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type } from "arktype";

const manifestSchema = type({ version: "string" });

function readAppVersion(): string {
	let directory = import.meta.dirname;

	while (true) {
		const raw = readManifest(join(directory, "package.json"));

		if (raw !== null) {
			return manifestSchema.assert(JSON.parse(raw)).version;
		}

		const parent = dirname(directory);

		if (parent === directory) {
			throw new Error("Bankai found no package.json to read its version from");
		}

		directory = parent;
	}
}

function readManifest(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

export const APP_VERSION = readAppVersion();
