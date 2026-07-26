import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { recordTrace, transcriptTrace } from "@main/activity/claudeTrace";
import { transcriptPath } from "@main/activity/claudeTranscript";

function assistantRecord(content: unknown[]): string {
	return JSON.stringify({ type: "assistant", message: { content } });
}

function toolUse(name: string): string {
	return assistantRecord([{ type: "tool_use", name, input: {} }]);
}

describe("recordTrace", () => {
	it("names the family a tool belongs to", () => {
		expect(recordTrace(toolUse("Bash"))).toBe("Running commands…");
		expect(recordTrace(toolUse("Read"))).toBe("Exploring…");
		expect(recordTrace(toolUse("Grep"))).toBe("Exploring…");
		expect(recordTrace(toolUse("Edit"))).toBe("Editing files…");
		expect(recordTrace(toolUse("Write"))).toBe("Editing files…");
		expect(recordTrace(toolUse("Subagent"))).toBe("Delegating…");
		expect(recordTrace(toolUse("WebSearch"))).toBe("Searching the web…");
		expect(recordTrace(toolUse("Skill"))).toBe("Loading a skill…");
	});

	it("reads an MCP tool by its bare name", () => {
		expect(recordTrace(toolUse("mcp__custom-tools__bash"))).toBe("Running commands…");
		expect(recordTrace(toolUse("mcp__custom-tools__edit"))).toBe("Editing files…");
	});

	it("falls back to the tool's own name when the family is unknown", () => {
		expect(recordTrace(toolUse("TaskUpdate"))).toBe("TaskUpdate…");
		expect(recordTrace(toolUse("mcp__context7__query-docs"))).toBe("query-docs…");
	});

	it("names the non-tool blocks", () => {
		expect(recordTrace(assistantRecord([{ type: "thinking", thinking: "hmm" }]))).toBe("Thinking…");
		expect(recordTrace(assistantRecord([{ type: "text", text: "aqui esta" }]))).toBe("Writing…");
	});

	it("takes the newest block of a record", () => {
		expect(
			recordTrace(assistantRecord([{ type: "thinking", thinking: "hmm" }, { type: "tool_use", name: "Bash" }])),
		).toBe("Running commands…");
	});

	it("ignores anything that is not the agent acting", () => {
		expect(recordTrace(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result" }] } }))).toBeNull();
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

		expect(await transcriptTrace(REF)).toBe("Running commands…");
	});

	it("looks past the records that are not the agent acting", async () => {
		transcript([
			toolUse("Edit"),
			JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
			JSON.stringify({ type: "attachment", attachment: {} }),
			JSON.stringify({ type: "queue-operation" }),
		]);

		expect(await transcriptTrace(REF)).toBe("Editing files…");
	});

	it("finds the agent behind a record too long to fit the tail", async () => {
		transcript([
			JSON.stringify({ type: "attachment", blob: "x".repeat(200_000) }),
			assistantRecord([{ type: "thinking", thinking: "hmm" }]),
		]);

		expect(await transcriptTrace(REF)).toBe("Thinking…");
	});

	it("has nothing to say when the transcript holds no agent record", async () => {
		transcript([JSON.stringify({ type: "user", message: { content: "oi" } })]);

		expect(await transcriptTrace(REF)).toBeNull();
	});

	it("has nothing to say when the transcript is missing or empty", async () => {
		transcript([]);

		expect(await transcriptTrace(REF)).toBeNull();
		expect(await transcriptTrace({ ...REF, sessionId: "no-such-session" })).toBeNull();
	});
});
