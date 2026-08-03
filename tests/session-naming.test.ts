import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";
import { TranscriptMaterial } from "@main/agents/transcript/transcript-material";
import { ClaudeNamer } from "@main/agents/harness/claude/claude-namer";
import { NameContract } from "@main/agents/naming/name-contract";

describe("name contract", () => {
	it("accepts a name that describes the session", () => {
		expect(NameContract.accept("Milestone naming for shells")).toBe("Milestone naming for shells");
		expect(NameContract.accept("Renomear sessões pelo modelo")).toBe("Renomear sessões pelo modelo");
		expect(NameContract.accept("セッション名の自動生成")).toBe("セッション名の自動生成");
	});

	it("normalizes whitespace and strips the quotes a model wraps around it", () => {
		expect(NameContract.accept("  Cache\n  invalidation  ")).toBe("Cache invalidation");
		expect(NameContract.accept('"Terminal resize glitch"')).toBe("Terminal resize glitch");
		expect(NameContract.accept("“Ajuste do login”")).toBe("Ajuste do login");
	});

	it("strips trailing punctuation instead of rejecting the name", () => {
		expect(NameContract.accept("Worktree cleanup on archive.")).toBe("Worktree cleanup on archive");
		expect(NameContract.accept("Sidebar ordering!")).toBe("Sidebar ordering");
		expect(NameContract.accept('"Fluxo de rename".')).toBe("Fluxo de rename");
	});

	it("rejects a name that carries no content", () => {
		expect(NameContract.accept("")).toBeNull();
		expect(NameContract.accept("   \n  ")).toBeNull();
		expect(NameContract.accept('"..."')).toBeNull();
	});

	it("rejects a name past the size the card can carry", () => {
		expect(NameContract.accept("a".repeat(NameContract.NAME_MAX_CHARS))).toHaveLength(NameContract.NAME_MAX_CHARS);
		expect(NameContract.accept("a".repeat(NameContract.NAME_MAX_CHARS + 1))).toBeNull();
	});

	it("keeps a name that overshoots what the prompt asked for", () => {
		const overshot = "Revisão de PR com agente antes de produção";

		expect(overshot.length).toBeGreaterThan(NameContract.NAME_TARGET_CHARS);
		expect(NameContract.accept(overshot)).toBe(overshot);
	});

	it("rejects the explanation a model answers with instead of a name", () => {
		expect(NameContract.accept("Here is a concise name for this coding session: Terminal resize glitch")).toBeNull();
	});
});

describe("naming call", () => {
	const call = ClaudeNamer.call(["arruma o header", "e agora o rodape"]);

	it("prints one answer from the naming model with no session left behind", () => {
		expect(call.file).toBe("claude");
		expect(call.args).toContain("-p");
		expect(call.args).toContain("--no-session-persistence");
		expect(call.args).toContain("--strict-mcp-config");
		expect(call.args.at(call.args.indexOf("--model") + 1)).toBe(ClaudeNamer.NAMING_MODEL);
		expect(call.args.at(call.args.indexOf("--disallowed-tools") + 1)).toBe(ClaudeNamer.NAMING_DISALLOWED_TOOLS.join(","));
	});

	it("sends the material as the prompt", () => {
		const prompt = call.args.at(call.args.indexOf("-p") + 1);

		expect(prompt).toContain("arruma o header");
		expect(prompt).toContain("e agora o rodape");
	});

	it("runs outside the project so nothing of it is loaded", () => {
		expect(call.options.cwd).toBe(tmpdir());
	});

	it("lets node kill a call that hangs", () => {
		expect(call.options.timeout).toBe(ClaudeNamer.NAMING_TIMEOUT_MS);
		expect(call.options.maxBuffer).toBe(ClaudeNamer.NAMING_OUTPUT_MAX_BYTES);
	});
});

describe("transcript material", () => {
	let configDir: string | undefined;

	afterEach(() => {
		if (configDir) {
			rmSync(configDir, { recursive: true, force: true });
			configDir = undefined;
		}
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	const REF = { sessionId: "8a8f0838-5ef9-40a6-bdef-706514079823", cwd: "/home/jui/projects/bankai" };

	function userRecord(content: unknown, extra: Record<string, unknown> = {}): string {
		return JSON.stringify({ type: "user", message: { content }, ...extra });
	}

	function transcript(lines: string[]): void {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		process.env.CLAUDE_CONFIG_DIR = configDir;
		const path = ClaudeTranscript.path(REF);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, `${lines.join("\n")}\n`);
	}

	it("keeps the opening and the most recent messages of a long conversation", async () => {
		transcript([
			userRecord("<command-name>/wayfinder</command-name>"),
			userRecord("primeira mensagem"),
			userRecord("system note", { isMeta: true }),
			userRecord("segunda mensagem"),
			JSON.stringify({ type: "assistant", message: { content: "resposta" } }),
			userRecord("terceira mensagem"),
			userRecord([{ type: "tool_result", content: "diff" }]),
			userRecord("quarta mensagem"),
			userRecord("quinta mensagem"),
			userRecord("<system-reminder>lembrete</system-reminder>"),
			userRecord("sexta mensagem"),
			userRecord([{ type: "text", text: "setima mensagem" }]),
		]);

		expect(await ClaudeTranscript.material(REF)).toEqual([
			"primeira mensagem",
			"segunda mensagem",
			"terceira mensagem",
			"quinta mensagem",
			"sexta mensagem",
			"setima mensagem",
		]);
	});

	it("sends a short conversation once, not twice", async () => {
		transcript([
			userRecord("primeira mensagem"),
			userRecord("segunda mensagem"),
			userRecord("terceira mensagem"),
			userRecord("quarta mensagem"),
		]);

		expect(await ClaudeTranscript.material(REF)).toEqual([
			"primeira mensagem",
			"segunda mensagem",
			"terceira mensagem",
			"quarta mensagem",
		]);
	});

	it("cuts a pasted wall of text down to a message the prompt can carry", async () => {
		transcript([userRecord("x".repeat(TranscriptMaterial.MATERIAL_MESSAGE_LIMIT * 3))]);

		expect(await ClaudeTranscript.material(REF)).toEqual(["x".repeat(TranscriptMaterial.MATERIAL_MESSAGE_LIMIT)]);
	});

	it("keeps the whole prompt small by dropping from the middle", async () => {
		const long = (marker: string) =>
			`${marker} ${"x".repeat(TranscriptMaterial.MATERIAL_MESSAGE_LIMIT)}`.slice(0, TranscriptMaterial.MATERIAL_MESSAGE_LIMIT);
		const markers = ["um", "dois", "tres", "quatro", "cinco", "seis"];

		transcript(markers.map((marker) => userRecord(long(marker))));

		const material = await ClaudeTranscript.material(REF);

		expect(material.join("\n").length).toBeLessThanOrEqual(TranscriptMaterial.MATERIAL_TOTAL_LIMIT);
		expect(material.at(0)).toBe(long("um"));
		expect(material.at(-1)).toBe(long("seis"));
	});

	it("yields nothing when the transcript is all noise or missing", async () => {
		transcript([userRecord("<system-reminder>x</system-reminder>")]);

		expect(await ClaudeTranscript.material(REF)).toEqual([]);

		process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "claude-config-missing-xyz");

		expect(await ClaudeTranscript.material(REF)).toEqual([]);
	});
});
