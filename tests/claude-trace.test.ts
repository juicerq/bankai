import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { LABEL_CAP, recordTrace, transcriptTrace } from "@main/activity/claudeTrace";
import { transcriptPath } from "@main/activity/claudeTranscript";

let records = 0;

function assistantRecord(content: unknown[]): string {
	records += 1;

	return JSON.stringify({ type: "assistant", uuid: `uuid-${records}`, message: { content } });
}

function toolUse(name: string, input?: Record<string, unknown>): string {
	return assistantRecord([{ type: "tool_use", name, input: input ?? {} }]);
}

describe("recordTrace", () => {
	it("names the family a tool belongs to", () => {
		expect(recordTrace(toolUse("Bash"))?.label).toBe("Running commands");
		expect(recordTrace(toolUse("Read"))?.label).toBe("Exploring");
		expect(recordTrace(toolUse("Grep"))?.label).toBe("Exploring");
		expect(recordTrace(toolUse("Edit"))?.label).toBe("Editing files");
		expect(recordTrace(toolUse("Write"))?.label).toBe("Editing files");
		expect(recordTrace(toolUse("Subagent"))?.label).toBe("Delegating");
		expect(recordTrace(toolUse("WebSearch"))?.label).toBe("Searching the web");
		expect(recordTrace(toolUse("Skill"))?.label).toBe("Loading a skill");
	});

	it("names what the tool is being used on, not only its family", () => {
		expect(recordTrace(toolUse("Read", { file_path: "/home/jui/projects/bankai-2/src/main/ipc.ts" }))?.label)
			.toBe("Reading ipc.ts");
		expect(recordTrace(toolUse("Edit", { file_path: "/a/b/session-rows.ts" }))?.label).toBe("Editing session-rows.ts");
		expect(recordTrace(toolUse("mcp__custom-tools__write", { path: "/a/b/paths.ts" }))?.label)
			.toBe("Editing paths.ts");
		expect(recordTrace(toolUse("Grep", { pattern: "tool_use" }))?.label).toBe("Grepping tool_use");
		expect(recordTrace(toolUse("Skill", { skill: "code-standards" }))?.label).toBe("Loading code-standards");
		expect(recordTrace(toolUse("Agent", { description: "Find the binder" }))?.label)
			.toBe("Delegating Find the binder");
		expect(recordTrace(toolUse("WebFetch", { url: "https://arktype.io/docs/intro" }))?.label)
			.toBe("Fetching arktype.io");
	});

	it("prefers a command's description, which is written to be read", () => {
		expect(
			recordTrace(toolUse("Bash", { command: "git status --porcelain", description: "Inspect the working tree" }))
				?.label,
		).toBe("Inspect the working tree");
	});

	it("cuts an undescribed command at the first shell operator", () => {
		expect(recordTrace(toolUse("Bash", { command: "bun run check 2>&1 | tail -20" }))?.label).toBe("bun run check");
		expect(recordTrace(toolUse("Bash", { command: "cd /home/jui/projects/bankai-2 && bun test" }))?.label)
			.toBe("bun test");
		expect(recordTrace(toolUse("Bash", { command: "cat > /tmp/probe.mjs <<'EOF'\nbody\nEOF" }))?.label).toBe("cat");
		expect(recordTrace(toolUse("Bash", { command: "sleep 30" }))?.label).toBe("sleep 30");
	});

	it("drops a quote that cutting the command left hanging open", () => {
		expect(recordTrace(toolUse("Bash", { command: 'grep -rn "ozone\\|swiftshader" src' }))?.label).toBe("grep -rn");
	});

	it("shapes the subject before capping it, so a deep path still shows its file", () => {
		expect(recordTrace(toolUse("Read", { file_path: `/${"deep/".repeat(30)}claudeTrace.ts` }))?.label)
			.toBe("Reading claudeTrace.ts");
	});

	it("caps a subject that would not fit a card", () => {
		const label = recordTrace(toolUse("WebSearch", { query: "x".repeat(200) }))?.label;

		expect(label).toHaveLength(LABEL_CAP + 1);
		expect(label?.endsWith("…")).toBe(true);
	});

	it("keeps the family label when the tool says nothing readable about its subject", () => {
		expect(recordTrace(toolUse("Read", { limit: 40 }))?.label).toBe("Exploring");
		expect(recordTrace(toolUse("Bash", { description: "   " }))?.label).toBe("Running commands");
		expect(recordTrace(toolUse("Bash", { command: ": > /tmp/probe.log" }))?.label).toBe("Running commands");
	});

	it("reads an MCP tool by its bare name", () => {
		expect(recordTrace(toolUse("mcp__custom-tools__bash"))?.label).toBe("Running commands");
		expect(recordTrace(toolUse("mcp__custom-tools__edit"))?.label).toBe("Editing files");
	});

	it("falls back to the tool's own name when the family is unknown", () => {
		expect(recordTrace(toolUse("TaskUpdate"))?.label).toBe("TaskUpdate");
		expect(recordTrace(toolUse("mcp__context7__query-docs"))?.label).toBe("query-docs");
	});

	it("identifies the record it read, so a caller can tell a repeat from a new one", () => {
		const first = recordTrace(toolUse("Bash"));

		expect(first?.recordId).toMatch(/^uuid-\d+$/);
		expect(recordTrace(toolUse("Bash"))?.recordId).not.toBe(first?.recordId);
	});

	it("falls back to the label as identity when the record carries no uuid", () => {
		expect(recordTrace(JSON.stringify({ type: "assistant", message: { content: [{ type: "text" }] } }))).toEqual({
			label: "Writing",
			recordId: "Writing",
		});
	});

	it("names the non-tool blocks", () => {
		expect(recordTrace(assistantRecord([{ type: "thinking", thinking: "hmm" }]))?.label).toBe("Thinking");
		expect(recordTrace(assistantRecord([{ type: "text", text: "aqui esta" }]))?.label).toBe("Writing");
	});

	it("takes the newest block of a record", () => {
		expect(
			recordTrace(assistantRecord([{ type: "thinking", thinking: "hmm" }, { type: "tool_use", name: "Bash" }]))?.label,
		).toBe("Running commands");
	});

	it("reads a record handed back to the agent as the agent thinking about it", () => {
		expect(recordTrace(JSON.stringify({ type: "user", uuid: "u-1", message: { content: [{ type: "tool_result" }] } })))
			.toEqual({ label: "Thinking", recordId: "u-1" });
		expect(recordTrace(JSON.stringify({ type: "user", message: { content: "faz isso" } }))).toEqual({
			label: "Thinking",
			recordId: "Thinking",
		});
	});

	it("ignores anything that is neither side of the turn", () => {
		expect(recordTrace(JSON.stringify({ type: "attachment" }))).toBeNull();
		expect(recordTrace(assistantRecord([{ type: "block-nobody-has-seen" }]))).toBeNull();
		expect(recordTrace(assistantRecord([{ type: "tool_use" }]))).toBeNull();
		expect(recordTrace('{"type":"assistant","message":{"content":[{"type":"too')).toBeNull();
		expect(recordTrace("")).toBeNull();
	});
});

describe("transcriptTrace", () => {
	const REF = { sessionId: "8a8f0838-5ef9-40a6-bdef-706514079823", cwd: "/home/jui/projects/bankai-2" };

	let configDir: string | undefined;

	afterEach(() => {
		if (configDir) {
			rmSync(configDir, { recursive: true, force: true });
			configDir = undefined;
		}
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	function transcript(lines: string[]): void {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		process.env.CLAUDE_CONFIG_DIR = configDir;
		const path = transcriptPath(REF);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, `${lines.join("\n")}\n`);
	}

	it("reads the newest thing the agent did", async () => {
		transcript([toolUse("Read"), assistantRecord([{ type: "thinking", thinking: "hmm" }]), toolUse("Bash")]);

		expect((await transcriptTrace(REF))?.label).toBe("Running commands");
	});

	it("says the agent is thinking once the tool result is back and no new block has landed", async () => {
		transcript([
			toolUse("Edit"),
			JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
			JSON.stringify({ type: "attachment", attachment: {} }),
			JSON.stringify({ type: "queue-operation" }),
		]);

		expect((await transcriptTrace(REF))?.label).toBe("Thinking");
	});

	it("says the agent is thinking on a prompt it has not answered yet", async () => {
		transcript([
			assistantRecord([{ type: "text", text: "pronto" }]),
			JSON.stringify({ type: "user", message: { content: "agora arruma o clock" } }),
			JSON.stringify({ type: "last-prompt", prompt: "agora arruma o clock" }),
		]);

		expect((await transcriptTrace(REF))?.label).toBe("Thinking");
	});

	it("finds the agent behind a record too long to fit the tail", async () => {
		transcript([
			JSON.stringify({ type: "attachment", blob: "x".repeat(200_000) }),
			assistantRecord([{ type: "thinking", thinking: "hmm" }]),
		]);

		expect((await transcriptTrace(REF))?.label).toBe("Thinking");
	});

	it("has nothing to say when the transcript holds neither side of a turn", async () => {
		transcript([JSON.stringify({ type: "attachment", attachment: {} }), JSON.stringify({ type: "mode" })]);

		expect(await transcriptTrace(REF)).toBeNull();
	});

	it("has nothing to say when the transcript is missing or empty", async () => {
		transcript([]);

		expect(await transcriptTrace(REF)).toBeNull();
		expect(await transcriptTrace({ ...REF, sessionId: "no-such-session" })).toBeNull();
	});
});
