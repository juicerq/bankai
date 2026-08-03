import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { HarnessCommand } from "@main/agents/harness/harness";
import { transcriptMaterial } from "@main/agents/harness/claude/claude-transcript";
import { Logger } from "@main/infra/logger";
import { NAME_TARGET_CHARS, acceptedName } from "@main/agents/naming/name-contract";

export const NAMING_MODEL = "haiku";
export const NAMING_TIMEOUT_MS = 30000;
export const NAMING_OUTPUT_MAX_BYTES = 64 * 1024;

export const NAMING_DISALLOWED_TOOLS = [
	"Bash",
	"BashOutput",
	"Edit",
	"Glob",
	"Grep",
	"KillShell",
	"NotebookEdit",
	"Read",
	"Skill",
	"SlashCommand",
	"Task",
	"TodoWrite",
	"WebFetch",
	"WebSearch",
	"Write",
];

interface NamingCall extends HarnessCommand {
	options: { cwd: string; timeout: number; maxBuffer: number; windowsHide: boolean };
}

const run = promisify(execFile);

function namingPrompt(material: string[]): string {
	return [
		"These are the messages a user wrote in a coding session, oldest first.",
		"Name the session after what it is about as a whole, not after any single message.",
		`Use at most ${NAME_TARGET_CHARS} characters.`,
		"Write the name in the same language the messages are written in.",
		"Answer with the name alone, on one line, with no quotes, no trailing punctuation and no explanation.",
		"",
		...material.map((message) => `- ${message}`),
	].join("\n");
}

export function namingCall(material: string[]): NamingCall {
	return {
		file: "claude",
		args: [
			"-p",
			namingPrompt(material),
			"--model",
			NAMING_MODEL,
			"--no-session-persistence",
			"--strict-mcp-config",
			"--disallowed-tools",
			NAMING_DISALLOWED_TOOLS.join(","),
		],
		options: {
			cwd: tmpdir(),
			timeout: NAMING_TIMEOUT_MS,
			maxBuffer: NAMING_OUTPUT_MAX_BYTES,
			windowsHide: true,
		},
	};
}

export async function claudeProposeName(ref: { sessionId: string; cwd: string }): Promise<string | null> {
	const material = await transcriptMaterial(ref);
	if (material.length === 0) {
		Logger.warn("naming:no-material", { sessionId: ref.sessionId });
		return null;
	}

	const call = namingCall(material);
	const output = await run(call.file, call.args, call.options).catch((err: unknown) => {
		Logger.warn("naming:call-failed", { sessionId: ref.sessionId, err: String(err) });
		return null;
	});

	if (!output) {
		return null;
	}

	const name = acceptedName(output.stdout);
	if (!name) {
		Logger.warn("naming:name-rejected", { sessionId: ref.sessionId, raw: output.stdout.trim() });
		return null;
	}

	return name;
}
