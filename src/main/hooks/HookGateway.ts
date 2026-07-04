import { randomUUID } from "node:crypto";
import {
	type IncomingMessage,
	type Server,
	type ServerResponse,
	createServer,
} from "node:http";
import { Logger } from "@main/logger";

const HTTP_EVENTS = [
	"UserPromptSubmit",
	"PostToolUse",
	"Stop",
	"Notification",
] as const;

const HTTP_EVENT_NAMES: ReadonlySet<string> = new Set(HTTP_EVENTS);

type HookEventName = (typeof HTTP_EVENTS)[number];

function isHookEventName(name: string): name is HookEventName {
	return HTTP_EVENT_NAMES.has(name);
}

export type HookEvent = {
	event: HookEventName;
	sessionId: string;
	transcriptPath?: string;
	cwd?: string;
	prompt?: string;
	toolName?: string;
	filePath?: string;
	content?: string;
	message?: string;
	raw: unknown;
};

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function normalize(
	sessionIdFromPath: string,
	payload: unknown,
): HookEvent | null {
	const p = rec(payload);
	const name = str(p.hook_event_name) ?? "";
	if (!isHookEventName(name)) {
		return null;
	}

	const input = rec(p.tool_input);
	return {
		event: name,
		sessionId: str(p.session_id) ?? sessionIdFromPath,
		transcriptPath: str(p.transcript_path),
		cwd: str(p.cwd),
		prompt: str(p.prompt),
		toolName: str(p.tool_name),
		filePath: str(input.file_path),
		content: str(input.content) ?? str(input.new_string),
		message: str(p.message),
		raw: payload,
	};
}

export class HookGateway {
	private readonly token = randomUUID();
	private server: Server | null = null;
	private port = 0;
	private readonly listeners = new Set<(event: HookEvent) => void>();

	onEvent(listener: (event: HookEvent) => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	settingsFor(sessionId: string) {
		// SessionStart omitted: type:http is ignored for it (command/mcp_tool only).
		const http = (event: string) => ({
			type: "http",
			url: `${this.origin}/hooks/${encodeURIComponent(sessionId)}?t=${this.token}&e=${event}`,
		});

		return {
			hooks: {
				UserPromptSubmit: [{ hooks: [http("UserPromptSubmit")] }],
				PostToolUse: [{ matcher: "Edit|Write", hooks: [http("PostToolUse")] }],
				Stop: [{ hooks: [http("Stop")] }],
				Notification: [{ hooks: [http("Notification")] }],
			},
			allowedHttpHookUrls: [`${this.origin}/*`],
		};
	}

	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => this.handle(req, res));
			server.on("error", reject);
			server.listen(0, "127.0.0.1", () => {
				const addr = server.address();
				this.port = addr && typeof addr === "object" ? addr.port : 0;
				this.server = server;
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		const running = this.server;
		if (!running) {
			return;
		}

		this.server = null;
		this.port = 0;
		await new Promise<void>((resolve) => {
			running.close(() => resolve());
		});
	}

	private get origin() {
		if (!this.port) {
			throw new Error("HookGateway not started");
		}
		return `http://127.0.0.1:${this.port}`;
	}

	private dispatch(event: HookEvent) {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private handle(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const match = /^\/hooks\/([^/]+)$/.exec(url.pathname);

		if (req.method !== "POST" || !match) {
			res.writeHead(404);
			res.end();
			return;
		}
		if (url.searchParams.get("t") !== this.token) {
			res.writeHead(403);
			res.end();
			return;
		}

		const sessionId = decodeURIComponent(match[1] as string);
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				Logger.warn("hooks:bad-json", { sessionId });
				res.writeHead(400);
				res.end();
				return;
			}

			const event = normalize(sessionId, payload);
			if (event) {
				this.dispatch(event);
			}

			res.writeHead(200, { "content-type": "application/json" });
			res.end("{}");
		});
	}
}
