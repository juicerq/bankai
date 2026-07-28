export type ConversationToolState = "running" | "done" | "failed";

export interface ConversationEdit {
	added: number;
	removed: number;
}

export type ConversationBlock =
	| { kind: "user"; id: string; text: string }
	| { kind: "agent"; id: string; text: string }
	| { kind: "thinking"; id: string; text: string }
	| { kind: "tool"; id: string; label: string; state: ConversationToolState; edit?: ConversationEdit }
	| { kind: "compacted"; id: string }
	| { kind: "interrupted"; id: string };

export interface ConversationSnapshot {
	blocks: ConversationBlock[];
	title?: string;
	startOffset: number;
	atStart: boolean;
}

export interface ConversationAppendedEvent {
	shellId: string;
	blocks: ConversationBlock[];
	title?: string;
}

export interface ConversationResetEvent extends ConversationSnapshot {
	shellId: string;
}

export interface BankaiConversationApi {
	subscribe: (shellId: string) => Promise<ConversationSnapshot>;
	history: (shellId: string, before: number) => Promise<void>;
	unsubscribe: (shellId: string) => void;
	onAppended: (listener: (event: ConversationAppendedEvent) => void) => () => void;
	onReset: (listener: (event: ConversationResetEvent) => void) => () => void;
}

export function mergeConversationBlocks(
	previous: ConversationBlock[],
	incoming: ConversationBlock[],
): ConversationBlock[] {
	if (incoming.length === 0) {
		return previous;
	}

	const merged = [...previous];
	const placed = new Map(merged.map((block, index) => [block.id, index]));

	for (const block of incoming) {
		const index = placed.get(block.id);

		if (index === undefined) {
			placed.set(block.id, merged.length);
			merged.push(block);

			continue;
		}

		merged[index] = block;
	}

	return merged;
}
