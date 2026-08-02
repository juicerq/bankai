import { harnessConversation } from "@main/activity/harnesses";
import { CONVERSATION_BACKFILL_BYTES, ConversationTail } from "@main/activity/conversationTail";
import { Logger } from "@main/logger";
import type { StreamConnection } from "@main/server/stream/connection";
import { Continuity, type ContinuitySessionRef, type ContinuityValue } from "@main/store/continuity";
import type {
	ConversationAddress,
	ConversationAppendedEvent,
	ConversationResetEvent,
	ConversationSnapshot,
} from "@shared/conversation";

const EMPTY_CONVERSATION: ConversationSnapshot = { blocks: [], startOffset: 0, atStart: true };

const CONVERSATION_HISTORY_STEPS = 4;

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

export class ConversationWatch {
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

		const conversation = harnessConversation(session.harness);
		if (!conversation) {
			return EMPTY_CONVERSATION;
		}

		const path = this.address.agent
			? await conversation.subagentTranscript?.(session, this.address.agent)
			: await conversation.transcript(session);

		if (!path || generation !== this.generation) {
			return EMPTY_CONVERSATION;
		}

		const tail = new ConversationTail(
			path,
			(event) =>
				this.connection.send("conversation", "appended", {
					...this.address,
					...event,
				} satisfies ConversationAppendedEvent),
			undefined,
			conversation.parser(),
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
