import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiDiscovery } from "@core/harness/pi/discovery";
import {
	PI_COMPANION_PROTOCOL,
	PI_DISCOVERY_DIR_ENV,
} from "@core/harness/pi/protocol";
import { procFs } from "@core/proc/procFs";
import { assertDefined } from "./utils/assertions";

async function discoveryDirectory(): Promise<string> {
	assertDefined(process.env.DATA_DIR);
	const directory = join(process.env.DATA_DIR, "pi-discovery");
	process.env[PI_DISCOVERY_DIR_ENV] = directory;
	await mkdir(directory, { recursive: true });
	return directory;
}

describe("PiDiscovery", () => {
	it("accepts a live companion record", async () => {
		const directory = await discoveryDirectory();
		const start = await procFs.procStart(process.pid);
		assertDefined(start);
		await writeFile(join(directory, `${process.pid}.json`), JSON.stringify({
			protocol: PI_COMPANION_PROTOCOL,
			pid: process.pid,
			procStart: start,
			sessionId: "pi-session",
			transcriptPath: "/tmp/pi-session.jsonl",
			mode: "interactive",
		}));

		expect(await PiDiscovery.discover()).toEqual([{
			pid: process.pid,
			procStart: start,
			sessionId: "pi-session",
			kind: "interactive",
		}]);
	});

	it("removes stale and malformed records", async () => {
		const directory = await discoveryDirectory();
		await writeFile(join(directory, "stale.json"), JSON.stringify({
			protocol: PI_COMPANION_PROTOCOL,
			pid: process.pid,
			procStart: "recycled",
			sessionId: "stale",
			transcriptPath: "/tmp/stale.jsonl",
			mode: "interactive",
		}));
		await writeFile(join(directory, "broken.json"), "{not json");

		expect(await PiDiscovery.discover()).toEqual([]);
		expect(await readdir(directory)).toEqual([]);
	});
});
