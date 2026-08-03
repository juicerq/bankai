import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexTranscript } from "@main/agents/harness/codex/codex-transcript";
import type { HarnessCommand } from "@main/agents/harness/harness";
import { Logger } from "@main/infra/logger";
import { NameContract } from "@main/agents/naming/name-contract";
import { type } from "arktype";

const NAMING_TIMEOUT_MS = 30000;
const NAMING_OUTPUT_MAX_BYTES = 64 * 1024;
const NAMING_REASONING_EFFORT = "low";

const NAME_SCHEMA = {
	type: "object",
	properties: { name: { type: "string" } },
	required: ["name"],
	additionalProperties: false,
};

const namedResultSchema = type({ name: "string" }).pipe((raw) => raw.name);

interface NamingCall extends HarnessCommand {
	options: {
		cwd: string;
		timeout: number;
		maxBuffer: number;
		windowsHide: boolean;
	};
}

function namingPrompt(material: string[]): string {
	return [
		"These are the messages a user wrote in a coding session, oldest first.",
		"Name the session after what it is about as a whole, not after any single message.",
		`Use at most ${NameContract.NAME_TARGET_CHARS} characters.`,
		"Write the name in the same language the messages are written in.",
		"Answer with the name alone, with no quotes and no trailing punctuation.",
		"",
		...material.map((message) => `- ${message}`),
	].join("\n");
}

function namingCall(input: {
	material: string[];
	workspace: string;
	schema: string;
	output: string;
}): NamingCall {
	return {
		file: "codex",
		args: [
			"exec",
			"--ephemeral",
			"--skip-git-repo-check",
			"--sandbox",
			"read-only",
			"--cd",
			input.workspace,
			"-c",
			`model_reasoning_effort="${NAMING_REASONING_EFFORT}"`,
			"-c",
			"mcp_servers={}",
			"--output-schema",
			input.schema,
			"--output-last-message",
			input.output,
			namingPrompt(input.material),
		],
		options: {
			cwd: input.workspace,
			timeout: NAMING_TIMEOUT_MS,
			maxBuffer: NAMING_OUTPUT_MAX_BYTES,
			windowsHide: true,
		},
	};
}

function runWithoutStdin(call: NamingCall): Promise<null> {
	return new Promise((resolve) => {
		const child = execFile(call.file, call.args, call.options, (err) => {
			if (err) {
				Logger.warn("codex:naming-call-failed", { err: err.message });
			}

			resolve(null);
		});

		child.stdin?.end();
	});
}

function proposedName(raw: string): string | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	const name = namedResultSchema(value);
	if (name instanceof type.errors) {
		return null;
	}

	return NameContract.accept(name);
}

async function codexProposeName(ref: { sessionId: string }): Promise<string | null> {
	const material = await CodexTranscript.material(ref);
	if (material.length === 0) {
		Logger.warn("codex:naming-no-material", { sessionId: ref.sessionId });

		return null;
	}

	const workspace = await mkdtemp(join(tmpdir(), "bankai-codex-name-"));

	try {
		const schema = join(workspace, "name.schema.json");
		const output = join(workspace, "name.json");
		await writeFile(schema, JSON.stringify(NAME_SCHEMA));
		await runWithoutStdin(namingCall({ material, workspace, schema, output }));

		const raw = await readFile(output, "utf8").catch(() => null);
		if (raw === null) {
			return null;
		}

		const name = proposedName(raw);
		if (!name) {
			Logger.warn("codex:naming-name-rejected", {
				sessionId: ref.sessionId,
				raw: raw.trim(),
			});
		}

		return name;
	} finally {
		await rm(workspace, { force: true, recursive: true }).catch((err: unknown) => {
			Logger.info("codex:naming-workspace-kept", {
				workspace,
				err: String(err),
			});
		});
	}
}

export const CodexNamer = {
	NAMING_TIMEOUT_MS,
	call: namingCall,
	parseName: proposedName,
	proposeName: codexProposeName,
};
