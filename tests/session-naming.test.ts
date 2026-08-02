import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { transcriptMaterial, transcriptPath } from "@main/activity/claude/claudeTranscript";
import { MATERIAL_MESSAGE_LIMIT, MATERIAL_TOTAL_LIMIT } from "@main/activity/transcriptMaterial";
import {
	NAMING_DISALLOWED_TOOLS,
	NAMING_MODEL,
	NAMING_OUTPUT_MAX_BYTES,
	NAMING_TIMEOUT_MS,
	namingCall,
} from "@main/naming/claudeNamer";
import { NAME_MAX_CHARS, NAME_TARGET_CHARS, acceptedName } from "@main/naming/nameContract";

describe("name contract", () => {
	it("accepts a name that describes the session", () => {
		expect(acceptedName("Milestone naming for shells")).toBe("Milestone naming for shells");
		expect(acceptedName("Renomear sessões pelo modelo")).toBe("Renomear sessões pelo modelo");
		expect(acceptedName("セッション名の自動生成")).toBe("セッション名の自動生成");
	});

	it("normalizes whitespace and strips the quotes a model wraps around it", () => {
		expect(acceptedName("  Cache\n  invalidation  ")).toBe("Cache invalidation");
		expect(acceptedName('"Terminal resize glitch"')).toBe("Terminal resize glitch");
		expect(acceptedName("“Ajuste do login”")).toBe("Ajuste do login");
	});

	it("strips trailing punctuation instead of rejecting the name", () => {
		expect(acceptedName("Worktree cleanup on archive.")).toBe("Worktree cleanup on archive");
		expect(acceptedName("Sidebar ordering!")).toBe("Sidebar ordering");
		expect(acceptedName('"Fluxo de rename".')).toBe("Fluxo de rename");
	});

	it("rejects a name that carries no content", () => {
		expect(acceptedName("")).toBeNull();
		expect(acceptedName("   \n  ")).toBeNull();
		expect(acceptedName('"..."')).toBeNull();
	});

	it("rejects a name past the size the card can carry", () => {
		expect(acceptedName("a".repeat(NAME_MAX_CHARS))).toHaveLength(NAME_MAX_CHARS);
		expect(acceptedName("a".repeat(NAME_MAX_CHARS + 1))).toBeNull();
	});

	it("keeps a name that overshoots what the prompt asked for", () => {
		const overshot = "Revisão de PR com agente antes de produção";

		expect(overshot.length).toBeGreaterThan(NAME_TARGET_CHARS);
		expect(acceptedName(overshot)).toBe(overshot);
	});

	it("rejects the explanation a model answers with instead of a name", () => {
		expect(acceptedName("Here is a concise name for this coding session: Terminal resize glitch")).toBeNull();
	});
});

describe("naming call", () => {
	const call = namingCall(["arruma o header", "e agora o rodape"]);

	it("prints one answer from the naming model with no session left behind", () => {
		expect(call.file).toBe("claude");
		expect(call.args).toContain("-p");
		expect(call.args).toContain("--no-session-persistence");
		expect(call.args).toContain("--strict-mcp-config");
		expect(call.args.at(call.args.indexOf("--model") + 1)).toBe(NAMING_MODEL);
		expect(call.args.at(call.args.indexOf("--disallowed-tools") + 1)).toBe(NAMING_DISALLOWED_TOOLS.join(","));
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
		expect(call.options.timeout).toBe(NAMING_TIMEOUT_MS);
		expect(call.options.maxBuffer).toBe(NAMING_OUTPUT_MAX_BYTES);
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
		const path = transcriptPath(REF);
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

		expect(await transcriptMaterial(REF)).toEqual([
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

		expect(await transcriptMaterial(REF)).toEqual([
			"primeira mensagem",
			"segunda mensagem",
			"terceira mensagem",
			"quarta mensagem",
		]);
	});

	it("cuts a pasted wall of text down to a message the prompt can carry", async () => {
		transcript([userRecord("x".repeat(MATERIAL_MESSAGE_LIMIT * 3))]);

		expect(await transcriptMaterial(REF)).toEqual(["x".repeat(MATERIAL_MESSAGE_LIMIT)]);
	});

	it("keeps the whole prompt small by dropping from the middle", async () => {
		const long = (marker: string) =>
			`${marker} ${"x".repeat(MATERIAL_MESSAGE_LIMIT)}`.slice(0, MATERIAL_MESSAGE_LIMIT);
		const markers = ["um", "dois", "tres", "quatro", "cinco", "seis"];

		transcript(markers.map((marker) => userRecord(long(marker))));

		const material = await transcriptMaterial(REF);

		expect(material.join("\n").length).toBeLessThanOrEqual(MATERIAL_TOTAL_LIMIT);
		expect(material.at(0)).toBe(long("um"));
		expect(material.at(-1)).toBe(long("seis"));
	});

	it("yields nothing when the transcript is all noise or missing", async () => {
		transcript([userRecord("<system-reminder>x</system-reminder>")]);

		expect(await transcriptMaterial(REF)).toEqual([]);

		process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "claude-config-missing-xyz");

		expect(await transcriptMaterial(REF)).toEqual([]);
	});
});
