import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	PI_COMPANION_PROTOCOL,
	PI_REVIEW_ENTRY,
} from "@core/harness/pi/protocol";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import { retainTabSessions } from "@core/session/TabSessionMonitor";
import { ReviewState } from "@core/store/review-state";
import { WorkspaceStore } from "@core/store/workspace";
import { WorkspacePersistence } from "@core/workspace/WorkspacePersistence";
import { assertDefined } from "./utils/assertions";
import { transcriptLine } from "./utils/transcripts";

function custom(sessionId: string, event: unknown) {
	return {
		type: "custom",
		customType: PI_REVIEW_ENTRY,
		data: { protocol: PI_COMPANION_PROTOCOL, originSessionId: sessionId, event },
	};
}

describe("Pi native Session switching", () => {
	it("keeps /tree work chronological under one native Session", async () => {
		assertDefined(process.env.DATA_DIR);
		const session = { harness: "pi" as const, sessionId: "tree" };
		process.env.PI_CODING_AGENT_SESSION_DIR = join(process.env.DATA_DIR, "pi-sessions");
		const directory = join(process.env.PI_CODING_AGENT_SESSION_DIR, "project");
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "tree.jsonl"), [
			{ type: "session", version: 3, id: session.sessionId, cwd: "/project" },
			custom(session.sessionId, { type: "eligible" }),
			custom(session.sessionId, { type: "prompt", prompt: "branch A" }),
			custom(session.sessionId, { type: "change", path: "/a", before: "", after: "A" }),
			custom(session.sessionId, { type: "complete" }),
			{ type: "branch_summary", fromId: "abandoned" },
			custom(session.sessionId, { type: "prompt", prompt: "branch B" }),
			custom(session.sessionId, { type: "change", path: "/b", before: "", after: "B" }),
			custom(session.sessionId, { type: "complete" }),
		].map(transcriptLine).join(""));
		const projector = new TranscriptProjector();

		await projector.refresh(session, true);

		expect((await projector.turns(session)).map((turn) => turn.prompt)).toEqual([
			"branch A",
			"branch B",
		]);
	});

	it("replaces the same Tab's parent binding with its child and keeps marks separate", async () => {
		const parent = { harness: "pi" as const, sessionId: "parent" };
		const child = { harness: "pi" as const, sessionId: "child" };
		const captures = retainTabSessions(
			[{ tabId: "tab" }],
			{ tab: { state: "bound", session: child, running: { kind: "interactive" } } },
			{ tab: { state: "bound", session: parent, running: { kind: "interactive" } } },
		);
		expect(captures.tab?.state === "bound" ? captures.tab.session : null).toEqual(child);

		await ReviewState.toggle(parent, "parent:0");
		expect(await ReviewState.get(parent)).toEqual(["parent:0"]);
		expect(await ReviewState.get(child)).toEqual([]);
	});

	it("persists only the Session currently bound after an in-process switch", async () => {
		const child = { harness: "pi" as const, sessionId: "child" };
		await WorkspacePersistence.save({
			projects: [{ id: "project" }],
			groups: {
				project: {
					tabs: [{ id: "tab", split: false, splitRatio: 0.5 }],
					active: 0,
				},
			},
			activeIndex: 0,
			focus: "terminal",
			zen: { command: false, review: false },
			screen: "command",
			reviewSession: null,
			captures: {
				tab: {
					state: "bound",
					session: child,
					running: { argv: ["pi", "--model", "custom"], kind: "interactive" },
				},
			},
		});

		const stored = await WorkspaceStore.read();
		expect(stored.projects[0]?.tabs[0]).toMatchObject({
			state: "bound",
			session: child,
		});
	});
});
