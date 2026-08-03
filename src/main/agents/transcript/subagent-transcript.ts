import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { type } from "arktype";
import { AGENT_TOOL_NAMES } from "@main/agents/harness/claude/claude-conversation";
import { locateTranscript } from "@main/agents/harness/claude/claude-transcript";
import { Logger } from "@main/infra/logger";

const SUBAGENT_META_SUFFIX = ".meta.json";

const agentCallSchema = type({
	type: "'assistant'",
	message: { content: "unknown[]" },
});

const agentUseSchema = type({
	type: "'tool_use'",
	id: "string",
	name: "string",
	"input?": { "name?": "string", "description?": "string" },
});

const subagentMetaSchema = type({
	"toolUseId?": "string",
	"name?": "string",
	"description?": "string",
});

interface SessionRef {
	sessionId: string;
	cwd: string;
}

type AgentCall = typeof agentUseSchema.infer.input;

async function agentCall(ref: SessionRef, toolUseId: string): Promise<AgentCall | undefined> {
	const path = await locateTranscript(ref);
	const stream = createReadStream(path, { encoding: "utf8" });
	const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

	try {
		for await (const line of lines) {
			if (!line.includes(toolUseId)) {
				continue;
			}

			const record = agentCallSchema(safeParse(line));
			if (record instanceof type.errors) {
				continue;
			}

			for (const entry of record.message.content) {
				const use = agentUseSchema(entry);
				if (use instanceof type.errors || use.id !== toolUseId || !AGENT_TOOL_NAMES.has(use.name.toLowerCase())) {
					continue;
				}

				return use.input ?? {};
			}
		}
	} catch (err) {
		Logger.warn("subagent:parent-unreadable", { path, err: String(err) });
	} finally {
		lines.close();
		stream.destroy();
	}

	return undefined;
}

function safeParse(line: string): unknown {
	try {
		return JSON.parse(line);
	} catch {
		return undefined;
	}
}

async function metaOf(directory: string, file: string): Promise<typeof subagentMetaSchema.infer | undefined> {
	const meta = subagentMetaSchema(safeParse(await readFile(join(directory, file), "utf8")));
	if (meta instanceof type.errors) {
		return undefined;
	}

	return meta;
}

export async function subagentTranscriptPath(ref: SessionRef, toolUseId: string): Promise<string | undefined> {
	const directory = join(dirname(await locateTranscript(ref)), ref.sessionId, "subagents");
	const files = await readdir(directory).catch(() => []);
	const metas = files.filter((file) => file.endsWith(SUBAGENT_META_SUFFIX));
	if (metas.length === 0) {
		return undefined;
	}

	const call = await agentCall(ref, toolUseId);
	const named = call?.name?.trim();
	const matched: string[] = [];

	for (const file of metas) {
		const meta = await metaOf(directory, file);
		if (!meta) {
			continue;
		}

		if (meta.toolUseId === toolUseId) {
			return join(directory, file.replace(SUBAGENT_META_SUFFIX, ".jsonl"));
		}

		if (named && meta.name === named && meta.description === call?.description) {
			matched.push(join(directory, file.replace(SUBAGENT_META_SUFFIX, ".jsonl")));
		}
	}

	if (matched.length !== 1) {
		return undefined;
	}

	return matched[0];
}
