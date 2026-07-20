import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	PI_COMPANION_PROTOCOL,
	PI_REVIEW_ENTRY,
} from "@core/harness/pi/protocol";
import { PiTranscript } from "@core/harness/pi/transcript";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import { assertDefined } from "./utils/assertions";
import { transcriptLine } from "./utils/transcripts";

const session = { harness: "pi" as const, sessionId: "pi-session" };

function custom(originSessionId: string, event: unknown, protocol = PI_COMPANION_PROTOCOL) {
	return {
		type: "custom",
		id: crypto.randomUUID().slice(0, 8),
		parentId: null,
		timestamp: new Date().toISOString(),
		customType: PI_REVIEW_ENTRY,
		data: { protocol, originSessionId, event },
	};
}

async function piTranscript(records: unknown[], sessionId = session.sessionId): Promise<string> {
	assertDefined(process.env.DATA_DIR);
	process.env.PI_CODING_AGENT_SESSION_DIR = join(process.env.DATA_DIR, "pi-sessions");
	const directory = join(process.env.PI_CODING_AGENT_SESSION_DIR, "project");
	const path = join(directory, `${sessionId}.jsonl`);
	await mkdir(directory, { recursive: true });
	await writeFile(path, [
		{ type: "session", version: 3, id: sessionId, cwd: "/project" },
		...records,
	].map(transcriptLine).join(""));
	return path;
}

describe("Pi Transcript projection", () => {
	it("projects only compatible native-origin companion evidence", async () => {
		await piTranscript([
			custom(session.sessionId, { type: "eligible" }),
			custom("parent", { type: "prompt", prompt: "copied parent" }),
			custom("parent", { type: "change", path: "/parent.ts", before: "a", after: "b" }),
			custom(session.sessionId, { type: "prompt", prompt: "/skill:testing exact words" }),
			custom(session.sessionId, { type: "change", path: "/a.ts", before: "old", after: "new" }),
			custom(session.sessionId, { type: "complete" }),
		]);
		const projector = new TranscriptProjector();

		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([{
			turnId: "pi-session:0",
			prompt: "/skill:testing exact words",
			state: "completed",
			files: [{ path: "/a.ts", before: ["old"], after: ["new"] }],
		}]);
		expect(await projector.unavailableReason(session)).toBeNull();
	});

	it("fails closed for historical and incompatible Sessions", async () => {
		await piTranscript([{ type: "message", message: { role: "user", content: "old" } }]);
		const projector = new TranscriptProjector();
		await projector.refresh(session, true);
		expect(await projector.unavailableReason(session)).toBe("historical");
		const historicalPath = (await PiTranscript.locateMany(new Set([session.sessionId])))
			.get(session.sessionId);
		assertDefined(historicalPath);
		await appendFile(historicalPath,
			transcriptLine(custom(session.sessionId, { type: "prompt", prompt: "new work" }))
			+ transcriptLine(custom(session.sessionId, {
				type: "change",
				path: "/new",
				before: "",
				after: "new",
			})));
		await projector.refresh(session, true);
		expect(await projector.unavailableReason(session)).toBe("historical");
		expect(await projector.turns(session)).toEqual([]);

		const incompatible = { harness: "pi" as const, sessionId: "incompatible" };
		await piTranscript([
			custom(incompatible.sessionId, { type: "eligible" }, PI_COMPANION_PROTOCOL + 1),
		], incompatible.sessionId);
		await projector.refresh(incompatible, true);
		expect(await projector.unavailableReason(incompatible)).toBe("historical");
	});

	it("propagates tool conflict and structural failure reasons", async () => {
		const path = await piTranscript([
			custom(session.sessionId, { type: "eligible" }),
			custom(session.sessionId, { type: "unavailable", reason: "tool-conflict" }),
		]);
		const projector = new TranscriptProjector();
		await projector.refresh(session, true);
		expect(await projector.unavailableReason(session)).toBe("tool-conflict");

		const malformed = { harness: "pi" as const, sessionId: "malformed" };
		const malformedPath = await piTranscript([
			custom(malformed.sessionId, { type: "eligible" }),
		], malformed.sessionId);
		await appendFile(malformedPath, transcriptLine({
			type: "custom",
			customType: PI_REVIEW_ENTRY,
			data: { protocol: PI_COMPANION_PROTOCOL },
		}));
		await projector.refresh(malformed, true);
		expect(await projector.unavailableReason(malformed)).toBe("unsafe");
		expect(path).not.toBe(malformedPath);
	});

	it("interrupts open Pi work when the process ends", async () => {
		await piTranscript([
			custom(session.sessionId, { type: "eligible" }),
			custom(session.sessionId, { type: "prompt", prompt: "change" }),
			custom(session.sessionId, { type: "change", path: "/a", before: "a", after: "b" }),
		]);
		const projector = new TranscriptProjector();
		await projector.refresh(session, true);
		await projector.refresh(session, false);

		expect((await projector.turns(session))[0]?.state).toBe("interrupted");
	});
});
