import { AgentActivity } from "@main/activity/AgentActivity";
import { transcriptPath } from "@main/activity/claudeTranscript";
import { ConversationTail } from "@main/activity/conversationTail";
import { Logger } from "@main/logger";
import type { StreamConnection } from "@main/server/stream/connection";
import { ConversationSchemas } from "@main/server/stream/messages";
import { Continuity, type ContinuitySessionRef, type ContinuityValue } from "@main/store/continuity";
import type { ConversationAppendedEvent, ConversationResetEvent, ConversationSnapshot } from "@shared/conversation";
import type { StreamEnvelope } from "@shared/stream";

const EMPTY_CONVERSATION: ConversationSnapshot = { blocks: [], truncated: false };

const watchesByConnection = new Map<string, Map<string, ConversationWatch>>();

function shellSession(value: ContinuityValue, shellId: string): ContinuitySessionRef | undefined {
	for (const workspace of value.workspaces) {
		const shell = workspace.shells.find((entry) => entry.id === shellId);
		if (shell) {
			return shell.session;
		}
	}

	return undefined;
}

function sameSession(left: ContinuitySessionRef | undefined, right: ContinuitySessionRef | undefined): boolean {
	return left?.sessionId === right?.sessionId && left?.cwd === right?.cwd;
}

class ConversationWatch {
	private tail: ConversationTail | undefined;
	private session: ContinuitySessionRef | undefined;
	private generation = 0;
	private stopContinuity: (() => void) | undefined;

	constructor(
		private readonly connection: StreamConnection,
		private readonly shellId: string,
	) {}

	async start(): Promise<ConversationSnapshot> {
		const { value } = await Continuity.load();
		this.session = shellSession(value, this.shellId);
		const snapshot = await this.open(this.generation);
		this.stopContinuity = Continuity.subscribe((next) => this.resolve(next));

		return snapshot;
	}

	stop(): void {
		this.generation += 1;
		this.stopContinuity?.();
		this.stopContinuity = undefined;
		this.tail?.stop();
		this.tail = undefined;
	}

	private resolve(value: ContinuityValue): void {
		const session = shellSession(value, this.shellId);
		if (sameSession(this.session, session)) {
			return;
		}

		this.session = session;
		this.restart().catch((err) =>
			Logger.warn("conversation:restart-failed", { shellId: this.shellId, err: String(err) }),
		);
	}

	private async restart(): Promise<void> {
		this.generation += 1;
		const generation = this.generation;
		this.tail?.stop();
		this.tail = undefined;

		const snapshot = await this.open(generation);
		if (generation !== this.generation) {
			return;
		}

		this.connection.send("conversation", "reset", {
			shellId: this.shellId,
			...snapshot,
		} satisfies ConversationResetEvent);
	}

	private async open(generation: number): Promise<ConversationSnapshot> {
		const session = this.session;
		if (!session) {
			return EMPTY_CONVERSATION;
		}

		const tail = new ConversationTail(transcriptPath(session), (event) =>
			this.connection.send("conversation", "appended", {
				shellId: this.shellId,
				...event,
			} satisfies ConversationAppendedEvent),
		);
		const snapshot = await tail.start();

		if (generation !== this.generation) {
			tail.stop();

			return EMPTY_CONVERSATION;
		}

		this.tail = tail;

		return snapshot;
	}
}

export function handleConversationMessage(connection: StreamConnection, message: StreamEnvelope): unknown {
	const { shellId } = ConversationSchemas.shell.assert(message.payload);
	const watches = watchesOf(connection);

	switch (message.type) {
		case "subscribe": {
			watches.get(shellId)?.stop();
			const watch = new ConversationWatch(connection, shellId);
			watches.set(shellId, watch);
			AgentActivity.markShellViewed(shellId);

			return watch.start();
		}
		case "unsubscribe": {
			watches.get(shellId)?.stop();
			watches.delete(shellId);

			return undefined;
		}
		default:
			throw new Error(`Unknown conversation message "${message.type}"`);
	}
}

function watchesOf(connection: StreamConnection): Map<string, ConversationWatch> {
	const existing = watchesByConnection.get(connection.id);
	if (existing) {
		return existing;
	}

	const watches = new Map<string, ConversationWatch>();
	watchesByConnection.set(connection.id, watches);
	connection.onClose(() => {
		watchesByConnection.delete(connection.id);
		for (const watch of watches.values()) {
			watch.stop();
		}
		watches.clear();
	});

	return watches;
}
