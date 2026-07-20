import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiTranscript } from "@core/harness/pi/transcript";
import { assertDefined } from "./utils/assertions";
import { transcriptLine } from "./utils/transcripts";

describe("PiTranscript", () => {
	it("locates native ids under the default agent session directory", async () => {
		assertDefined(process.env.DATA_DIR);
		process.env.PI_CODING_AGENT_DIR = join(process.env.DATA_DIR, "pi-agent");
		const directory = join(process.env.PI_CODING_AGENT_DIR, "sessions", "project");
		const path = join(directory, "session.jsonl");
		await mkdir(directory, { recursive: true });
		await writeFile(path, transcriptLine({
			type: "session",
			version: 3,
			id: "pi-session",
			timestamp: new Date().toISOString(),
			cwd: "/project",
		}));

		expect(await PiTranscript.locateMany(new Set(["pi-session"]))).toEqual(
			new Map([["pi-session", path]]),
		);
	});

	it("honors the process-wide session directory override", async () => {
		assertDefined(process.env.DATA_DIR);
		process.env.PI_CODING_AGENT_SESSION_DIR = join(process.env.DATA_DIR, "pi-sessions");
		const path = join(process.env.PI_CODING_AGENT_SESSION_DIR, "session.jsonl");
		await mkdir(process.env.PI_CODING_AGENT_SESSION_DIR, { recursive: true });
		await writeFile(path, transcriptLine({ type: "session", id: "override" }));

		expect((await PiTranscript.locateMany(new Set(["override"]))).get("override")).toBe(path);
	});
});
