import {
	type IncomingMessage,
	type Server,
	type ServerResponse,
	createServer,
} from "node:http";
import { Logger } from "@core/logger";

const HOOK_PORT = 47820;

const HOOK_ENDPOINT = `http://127.0.0.1:${HOOK_PORT}/hooks`;

export const HOOK_COMMAND = `curl -sS --max-time 0.2 -X POST --data-binary @- ${HOOK_ENDPOINT} || true`;

export const HOOK_EVENTS = [
	{ event: "UserPromptSubmit", matcher: undefined },
	{ event: "PostToolUse", matcher: "Edit|Write" },
	{ event: "Stop", matcher: undefined },
	{ event: "Notification", matcher: undefined },
] as const;

type HookEventName = (typeof HOOK_EVENTS)[number]["event"];

const HOOK_EVENT_NAMES: ReadonlySet<string> = new Set(HOOK_EVENTS.map((h) => h.event));

function isHookEventName(name: string): name is HookEventName {
	return HOOK_EVENT_NAMES.has(name);
}

export type HookEvent = {
	event: HookEventName;
	sessionId: string;
	cwd?: string;
	transcriptPath?: string;
	prompt?: string;
	filePath?: string;
	content?: string;
	oldString?: string;
	newString?: string;
	replaceAll?: boolean;
	message?: string;
};

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function normalize(payload: unknown): HookEvent | null {
	const p = rec(payload);
	const name = str(p.hook_event_name) ?? "";
	if (!isHookEventName(name)) {
		return null;
	}

	const sessionId = str(p.session_id);
	if (!sessionId) {
		return null;
	}

	const input = rec(p.tool_input);
	return {
		event: name,
		sessionId,
		cwd: str(p.cwd),
		transcriptPath: str(p.transcript_path),
		prompt: str(p.prompt),
		filePath: str(input.file_path),
		content: str(input.content),
		oldString: str(input.old_string),
		newString: str(input.new_string),
		replaceAll: input.replace_all === true,
		message: str(p.message),
	};
}

export class HookGateway {
	private server: Server | null = null;
	private boundPort = HOOK_PORT;
	private readonly listeners = new Set<(event: HookEvent) => void>();

	onEvent(listener: (event: HookEvent) => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	get port(): number {
		return this.boundPort;
	}

	start(port: number = HOOK_PORT): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => this.handle(req, res));
			server.on("error", reject);
			server.listen(port, "127.0.0.1", () => {
				const address = server.address();
				if (address !== null && typeof address === "object") {
					this.boundPort = address.port;
				}
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
		await new Promise<void>((resolve) => {
			running.close(() => resolve());
		});
	}

	private dispatch(event: HookEvent) {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private handle(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url ?? "/", HOOK_ENDPOINT);
		if (req.method !== "POST" || url.pathname !== "/hooks") {
			res.writeHead(404);
			res.end();
			return;
		}

		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				Logger.warn("hooks:bad-json", {});
				res.writeHead(400);
				res.end();
				return;
			}

			const event = normalize(payload);
			if (event) {
				this.dispatch(event);
			}

			res.writeHead(200, { "content-type": "application/json" });
			res.end("{}");
		});
	}
}
