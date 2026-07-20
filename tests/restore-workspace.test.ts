import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Projects } from "@core/store/projects";
import { ReviewState } from "@core/store/review-state";
import { WorkspaceStore } from "@core/store/workspace";
import { SPLIT_RATIO_DEFAULT } from "@core/workspace/WorkspaceGroup";
import { restoreWorkspace } from "@core/workspace/restoreWorkspace";
import { assertDefined } from "./utils/assertions";
import { claudeTranscript, codexTranscript } from "./utils/transcripts";

describe("restoreWorkspace", () => {
	it("restores projects, running Sessions, and the selected Review together", async () => {
		assertDefined(process.env.DATA_DIR);
		process.env.CLAUDE_CONFIG_DIR = join(process.env.DATA_DIR, "claude");
		const transcriptDir = join(
			process.env.CLAUDE_CONFIG_DIR,
			"projects",
			"project",
		);
		await mkdir(transcriptDir, { recursive: true });

		const session = { harness: "claude" as const, sessionId: "session" };
		await writeFile(join(transcriptDir, "session.jsonl"), [
			{ type: "user", message: { content: "change it" } },
			{
				type: "user",
				toolUseResult: {
					filePath: "/a.ts",
					originalFile: "old",
					content: "new",
				},
			},
			{ type: "system", subtype: "turn_duration" },
		].map((record) => JSON.stringify(record)).join("\n") + "\n");

		const [project] = await Projects.add({
			cwd: process.env.DATA_DIR,
			name: "Project",
		});
		assertDefined(project);
		await WorkspaceStore.write({
			projects: [{
				projectId: project.id,
				tabs: [{
					state: "bound",
					session,
					running: { argv: ["claude"] },
				}],
				activeTab: 0,
			}],
			focusedProjectId: project.id,
			focus: "terminal",
			zen: { command: false, review: false },
			screen: "review",
			reviewSession: session,
		});
		await ReviewState.toggle(session, "session:0");

		const restored = await restoreWorkspace();

		expect(restored.projects).toEqual([project]);
		expect(restored.plan.projects[0]?.tabs[0]).toEqual({
			split: false,
			splitRatio: SPLIT_RATIO_DEFAULT,
			runningSession: { session, argv: ["claude"] },
			resumable: true,
		});
		expect(restored.review).toEqual({
			session,
			turns: [{
				turnId: "session:0",
				prompt: "change it",
				files: [{ path: "/a.ts", before: ["old"], after: ["new"] }],
				state: "completed",
			}],
			reviewed: ["session:0"],
			available: true,
		});
	});

	it("locates equal native ids independently across Harnesses", async () => {
		assertDefined(process.env.DATA_DIR);
		await Promise.all([
			claudeTranscript("shared"),
			codexTranscript("shared"),
		]);
		const [project] = await Projects.add({
			cwd: process.env.DATA_DIR,
			name: "Project",
		});
		assertDefined(project);
		const claude = { harness: "claude" as const, sessionId: "shared" };
		const codex = { harness: "codex" as const, sessionId: "shared" };
		await WorkspaceStore.write({
			projects: [{
				projectId: project.id,
				tabs: [
					{ state: "bound", session: claude, running: { argv: ["claude"] } },
					{ state: "bound", session: codex, running: { argv: ["codex"] } },
				],
				activeTab: 1,
			}],
			focusedProjectId: project.id,
			focus: "terminal",
			zen: { command: false, review: false },
			screen: "command",
			reviewSession: null,
		});

		const restored = await restoreWorkspace();

		expect(restored.plan.projects[0]?.tabs).toEqual([
			{ split: false, splitRatio: SPLIT_RATIO_DEFAULT, runningSession: { session: claude, argv: ["claude"] }, resumable: true },
			{ split: false, splitRatio: SPLIT_RATIO_DEFAULT, runningSession: { session: codex, argv: ["codex"] }, resumable: true },
		]);
	});
});
