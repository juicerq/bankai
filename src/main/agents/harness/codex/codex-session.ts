import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Logger } from "@main/infra/logger";
import { type } from "arktype";

const RESPONSE_ID = 2;
const READ_TIMEOUT_MS = 5_000;
const NAME_LIMIT = 120;

const responseSchema = type({
	id: "number",
	result: {
		thread: {
			id: "string",
			name: "string|null",
			preview: "string",
			path: "string|null",
		},
	},
}).pipe((raw) => ({
	id: raw.id,
	sessionId: raw.result.thread.id,
	name: raw.result.thread.name,
	preview: raw.result.thread.preview,
	transcript: raw.result.thread.path,
}));

const responseIdSchema = type({ id: "number" }).pipe((raw) => raw.id);

function request(sessionId: string): string {
	return [
		{
			method: "initialize",
			id: 1,
			params: {
				clientInfo: { name: "bankai", title: "Bankai", version: "0" },
				capabilities: null,
			},
		},
		{ method: "initialized" },
		{ method: "thread/read", id: RESPONSE_ID, params: { threadId: sessionId, includeTurns: false } },
	]
		.map((message) => JSON.stringify(message))
		.join("\n") + "\n";
}

function sessionFromLine(
	line: string,
	sessionId: string,
): { name: string | null; transcript: string | null } | null | undefined {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return undefined;
	}

	const responseId = responseIdSchema(value);
	if (responseId instanceof type.errors || responseId !== RESPONSE_ID) {
		return undefined;
	}

	const response = responseSchema(value);
	if (response instanceof type.errors || response.sessionId !== sessionId) {
		return null;
	}

	const name = [response.name, response.preview]
		.find((candidate) => !!candidate?.trim())
		?.trim()
		.replace(/\s+/g, " ")
		.slice(0, NAME_LIMIT) ?? null;

	return { name, transcript: response.transcript };
}

async function readResponse(
	stdout: NodeJS.ReadableStream,
	sessionId: string,
): Promise<{ name: string | null; transcript: string | null } | null> {
	const lines = createInterface({ input: stdout, crlfDelay: Number.POSITIVE_INFINITY });

	try {
		for await (const line of lines) {
			const session = sessionFromLine(line, sessionId);
			if (session !== undefined) {
				return session;
			}
		}
	} finally {
		lines.close();
	}

	return null;
}

async function readCodexSession(sessionId: string): Promise<{ name: string | null; transcript: string | null } | null> {
	const child = spawn("codex", ["app-server"], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
	let errorOutput = "";
	let spawnError: Error | undefined;
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		errorOutput += chunk;
	});
	const exited = new Promise<number | null>((resolve) => {
		child.once("error", (err) => {
			spawnError = err;
			resolve(null);
		});
		child.once("close", resolve);
	});

	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, READ_TIMEOUT_MS);

	try {
		child.stdin.write(request(sessionId));
		const session = await readResponse(child.stdout, sessionId);
		child.stdin.end();
		const exitCode = await exited;

		if (timedOut) {
			Logger.warn("codex:app-server-timeout", { sessionId });
			return null;
		}
		if (spawnError) {
			Logger.warn("codex:app-server-unavailable", { err: String(spawnError) });
			return null;
		}
		if (exitCode !== 0 || !session) {
			Logger.info("codex:session-unreadable", { sessionId, exitCode, stderr: errorOutput });
			return null;
		}

		return session;
	} finally {
		clearTimeout(timeout);
		child.stdin.end();
	}
}

export const CodexSession = {
	read: readCodexSession,
};
