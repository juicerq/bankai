import { AgentActivity } from "@main/activity/AgentActivity";
import { locateTranscript } from "@main/activity/claudeTranscript";
import { CONVERSATION_BACKFILL_BYTES, ConversationTail } from "@main/activity/conversationTail";
import { subagentTranscriptPath } from "@main/activity/subagentTranscript";
import { Logger } from "@main/logger";
import type { StreamConnection } from "@main/server/stream/connection";
import { releaseWatch, replaceWatch } from "@main/server/stream/connectionWatches";
import { ConversationSchemas } from "@main/server/stream/messages";
import { Continuity, type ContinuitySessionRef, type ContinuityValue } from "@main/store/continuity";
import type {
	ConversationAddress,
	ConversationAppendedEvent,
	ConversationResetEvent,
	ConversationSnapshot,
} from "@shared/conversation";
import type { StreamEnvelope } from "@shared/stream";

const EMPTY_CONVERSATION: ConversationSnapshot = { blocks: [], startOffset: 0, atStart: true };

const CONVERSATION_HISTORY_STEPS = 4;

const conversationWatches = new Map<string, ConversationWatch>();

function addressKey(address: ConversationAddress): string {
	return `${address.shellId} ${address.agent ?? ""}`;
}

function watchKey(connection: StreamConnection, address: ConversationAddress): string {
	return `${connection.id} ${addressKey(address)}`;
}

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
	private oldest: string | undefined;
	private startOffset = 0;
	private stopContinuity: (() => void) | undefined;

	constructor(
		private readonly connection: StreamConnection,
		private readonly address: ConversationAddress,
	) {}

	async start(): Promise<ConversationSnapshot> {
		const generation = this.generation;
		const { value } = await Continuity.load();

		if (generation !== this.generation) {
			return EMPTY_CONVERSATION;
		}

		this.session = shellSession(value, this.address.shellId);
		const snapshot = await this.open(generation);

		if (generation !== this.generation) {
			return EMPTY_CONVERSATION;
		}

		this.stopContinuity = Continuity.subscribe((next) => this.resolve(next));

		return snapshot;
	}

	async history(before: number): Promise<void> {
		if (before <= 0 || !this.session || before !== this.startOffset) {
			return;
		}

		this.generation += 1;
		const generation = this.generation;
		const known = this.oldest;
		let snapshot = EMPTY_CONVERSATION;

		for (let step = 1; step <= CONVERSATION_HISTORY_STEPS; step += 1) {
			this.tail?.stop();
			this.tail = undefined;
			snapshot = await this.open(generation, Math.max(0, before - step * CONVERSATION_BACKFILL_BYTES));

			if (generation !== this.generation) {
				return;
			}

			if (snapshot.atStart || snapshot.blocks[0]?.id !== known) {
				break;
			}
		}

		if (!snapshot.atStart && snapshot.blocks[0]?.id === known) {
			Logger.warn("conversation:history-exhausted", { ...this.address, before });
		}

		this.connection.send("conversation", "reset", {
			...this.address,
			...snapshot,
		} satisfies ConversationResetEvent);
	}

	stop(): void {
		this.generation += 1;
		this.stopContinuity?.();
		this.stopContinuity = undefined;
		this.tail?.stop();
		this.tail = undefined;
	}

	private resolve(value: ContinuityValue): void {
		const session = shellSession(value, this.address.shellId);
		if (sameSession(this.session, session)) {
			return;
		}

		this.session = session;
		this.restart().catch((err) => Logger.warn("conversation:restart-failed", { ...this.address, err: String(err) }));
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
			...this.address,
			...snapshot,
		} satisfies ConversationResetEvent);
	}

	private async open(generation: number, from?: number): Promise<ConversationSnapshot> {
		const session = this.session;
		if (!session) {
			return EMPTY_CONVERSATION;
		}

		const path = this.address.agent
			? await subagentTranscriptPath(session, this.address.agent)
			: await locateTranscript(session);

		if (!path || generation !== this.generation) {
			return EMPTY_CONVERSATION;
		}

		const tail = new ConversationTail(path, (event) =>
			this.connection.send("conversation", "appended", {
				...this.address,
				...event,
			} satisfies ConversationAppendedEvent),
		);
		const snapshot = await tail.start(from);

		if (generation !== this.generation) {
			tail.stop();

			return EMPTY_CONVERSATION;
		}

		this.tail = tail;
		this.oldest = snapshot.blocks[0]?.id;
		this.startOffset = snapshot.startOffset;

		return snapshot;
	}
}

export function handleConversationMessage(connection: StreamConnection, message: StreamEnvelope): unknown {
	if (message.type === "history") {
		const { before, ...address } = ConversationSchemas.history.assert(message.payload);

		return conversationWatches.get(watchKey(connection, address))?.history(before);
	}

	const address = ConversationSchemas.shell.assert(message.payload);
	const key = watchKey(connection, address);

	switch (message.type) {
		case "subscribe": {
			const watch = new ConversationWatch(connection, address);
			replaceWatch({ connection, channel: "conversation", key: addressKey(address) }, () => {
				watch.stop();

				if (conversationWatches.get(key) === watch) {
					conversationWatches.delete(key);
				}
			});
			conversationWatches.set(key, watch);
			AgentActivity.markShellViewed(address.shellId);

			return watch.start();
		}
		case "unsubscribe":
			releaseWatch({ connection, channel: "conversation", key: addressKey(address) });

			return undefined;
		default:
			throw new Error(`Unknown conversation message "${message.type}"`);
	}
}
