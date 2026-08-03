import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CodexHarness } from "@main/agents/harness/codex/codex-harness";
import { codexSessionsDir } from "@main/agents/harness/codex/codex-config";
import { codexMaterial, codexTitle, messageIntent, rolloutPath } from "@main/agents/harness/codex/codex-transcript";
import { MATERIAL_EDGE_COUNT, MATERIAL_MESSAGE_LIMIT, MATERIAL_TOTAL_LIMIT } from "@main/agents/transcript/transcript-material";
import { codexProposeName, namingCall, NAMING_TIMEOUT_MS, proposedName } from "@main/agents/harness/codex/codex-namer";
import { NAME_MAX_CHARS } from "@main/agents/naming/name-contract";

const SESSION = "019f898d-719d-7811-9b34-86470df90a52";

const SMOKE_ENABLED = process.env.BANKAI_CODEX_SMOKE === "1";
const smokeTest = SMOKE_ENABLED ? test : test.skip;

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bankai-codex-naming-"));
	process.env.CODEX_HOME = home;
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
	delete process.env.CODEX_HOME;
});

function userMessage(message: string): string {
	return `${JSON.stringify({ type: "event_msg", payload: { type: "user_message", message } })}\n`;
}

function writeRollout(messages: string[], sessionId = SESSION): void {
	const day = join(home, "sessions", "2026", "07", "22");
	mkdirSync(day, { recursive: true });
	writeFileSync(
		join(day, `rollout-2026-07-22T08-19-36-${sessionId}.jsonl`),
		JSON.stringify({ type: "session_meta", payload: { session_id: sessionId, cwd: "/x", source: "cli" } }) +
			"\n" +
			messages.map(userMessage).join(""),
	);
}

describe("what enters the naming sample", () => {
	test("takes the message out of a validated user_message record", () => {
		expect(messageIntent(userMessage("remover o debounce do resize").trim())).toBe("remover o debounce do resize");
	});

	test("takes nothing from any other record", () => {
		expect(messageIntent('{"type":"event_msg","payload":{"type":"agent_message","message":"hi"}}')).toBeNull();
		expect(messageIntent('{"type":"session_meta","payload":{"session_id":"x"}}')).toBeNull();
		expect(messageIntent("{ not json")).toBeNull();
	});

	test("takes nothing from an empty message or from injected ambient context", () => {
		expect(messageIntent(userMessage("   ").trim())).toBeNull();
		expect(messageIntent(userMessage('<in-app-browser-context source="ambient-ui-state">\nstate').trim())).toBeNull();
	});

	test("caps one message at the shared message limit", () => {
		const found = messageIntent(userMessage("a".repeat(MATERIAL_MESSAGE_LIMIT + 50)).trim(), MATERIAL_MESSAGE_LIMIT);

		expect(found).toHaveLength(MATERIAL_MESSAGE_LIMIT);
	});
});

describe("sampling a rollout", () => {
	test("takes the first three and the last three messages", async () => {
		writeRollout(["one", "two", "three", "four", "five", "six", "seven", "eight"]);

		expect(await codexMaterial({ sessionId: SESSION })).toEqual(["one", "two", "three", "six", "seven", "eight"]);
	});

	test("keeps a short session whole", async () => {
		writeRollout(["one", "two"]);

		expect(await codexMaterial({ sessionId: SESSION })).toEqual(["one", "two"]);
	});

	test("drops from the middle until the sample fits the total limit", async () => {
		writeRollout(Array.from({ length: 8 }, () => "a".repeat(MATERIAL_MESSAGE_LIMIT)));
		const material = await codexMaterial({ sessionId: SESSION });

		expect(material.join("\n").length).toBeLessThanOrEqual(MATERIAL_TOTAL_LIMIT);
		expect(material.length).toBeLessThan(MATERIAL_EDGE_COUNT * 2);
	});

	test("samples nothing from a session whose rollout is gone", async () => {
		expect(await codexMaterial({ sessionId: SESSION })).toEqual([]);
		expect(await rolloutPath(SESSION)).toBeNull();
	});

	test("titles a session after the first thing its user asked for", async () => {
		writeRollout(["remover o debounce do resize", "ok, faz isso"]);

		expect(await codexTitle({ sessionId: SESSION })).toBe("remover o debounce do resize");
	});
});

describe("the naming call", () => {
	const call = namingCall({
		material: ["remover o debounce do resize"],
		workspace: "/tmp/bankai-codex-name-x",
		schema: "/tmp/bankai-codex-name-x/name.schema.json",
		output: "/tmp/bankai-codex-name-x/name.json",
	});

	test("runs codex without persisting a session", () => {
		expect(call.file).toBe("codex");
		expect(call.args.slice(0, 2)).toEqual(["exec", "--ephemeral"]);
	});

	test("gives the model no writable access to any project", () => {
		expect(call.args).toContain("--sandbox");
		expect(call.args[call.args.indexOf("--sandbox") + 1]).toBe("read-only");
		expect(call.args[call.args.indexOf("--cd") + 1]).toBe("/tmp/bankai-codex-name-x");
		expect(call.options.cwd).toBe("/tmp/bankai-codex-name-x");
	});

	test("asks for a structured answer written to a file it owns", () => {
		expect(call.args[call.args.indexOf("--output-schema") + 1]).toBe("/tmp/bankai-codex-name-x/name.schema.json");
		expect(call.args[call.args.indexOf("--output-last-message") + 1]).toBe("/tmp/bankai-codex-name-x/name.json");
	});

	test("stays bounded in time", () => {
		expect(call.options.timeout).toBe(NAMING_TIMEOUT_MS);
	});

	test("carries the messages it is naming", () => {
		expect(call.args.at(-1)).toContain("remover o debounce do resize");
	});
});

describe("accepting what the model answered", () => {
	test("takes the name out of the structured answer", () => {
		expect(proposedName('{"name":"Remover debounce do painel de diff"}')).toBe("Remover debounce do painel de diff");
	});

	test("strips the quotes and trailing punctuation a model adds anyway", () => {
		expect(proposedName('{"name":"\\"Remover debounce\\"."}')).toBe("Remover debounce");
	});

	test("refuses an answer that is not the agreed shape", () => {
		expect(proposedName("Remover debounce")).toBeNull();
		expect(proposedName('{"title":"Remover debounce"}')).toBeNull();
		expect(proposedName('{"name":42}')).toBeNull();
	});

	test("refuses an empty or oversized name", () => {
		expect(proposedName('{"name":"   "}')).toBeNull();
		expect(proposedName(JSON.stringify({ name: "a".repeat(NAME_MAX_CHARS + 1) }))).toBeNull();
	});
});

describe("naming a session with nothing to name", () => {
	test("keeps the current name instead of calling codex at all", async () => {
		expect(await codexProposeName({ sessionId: SESSION })).toBeNull();
	});
});

describe("the harness's naming capability", () => {
	test("is declared, so the namer reaches codex sessions through the same boundary", () => {
		expect(CodexHarness.proposeName).toBe(codexProposeName);
		expect(CodexHarness.title).toBe(codexTitle);
	});
});

describe("a real bounded naming call", () => {
	smokeTest(
		"earns one accepted name without touching a project or leaving a session",
		async () => {
			delete process.env.CODEX_HOME;
			const rollouts = () => readdirSync(codexSessionsDir(), { recursive: true }).length;
			const before = rollouts();
			const workspace = mkdtempSync(join(tmpdir(), "bankai-codex-smoke-"));

			try {
				const schema = join(workspace, "name.schema.json");
				const output = join(workspace, "name.json");
				writeFileSync(
					schema,
					JSON.stringify({
						type: "object",
						properties: { name: { type: "string" } },
						required: ["name"],
						additionalProperties: false,
					}),
				);
				const call = namingCall({
					material: ["quero remover o debounce do resize do painel de diff", "ok, faz isso"],
					workspace,
					schema,
					output,
				});
				const child = Bun.spawn([call.file, ...call.args], {
					cwd: call.options.cwd,
					stdin: "ignore",
					stdout: "ignore",
					stderr: "ignore",
				});
				await child.exited;

				expect(proposedName(readFileSync(output, "utf8"))).not.toBeNull();
				expect(rollouts()).toBe(before);
			} finally {
				rmSync(workspace, { recursive: true, force: true });
				process.env.CODEX_HOME = home;
			}
		},
		NAMING_TIMEOUT_MS * 4,
	);
});
