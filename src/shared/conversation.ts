export type ConversationToolState = "running" | "done" | "failed";

export interface ConversationEdit {
	added: number;
	removed: number;
}

export type ConversationBlock =
	| { kind: "user"; id: string; text: string }
	| { kind: "agent"; id: string; text: string }
	| { kind: "thinking"; id: string; text: string }
	| {
		kind: "tool";
		id: string;
		label: string;
		state: ConversationToolState;
		edit?: ConversationEdit;
		agent?: boolean;
	}
	| { kind: "compacted"; id: string }
	| { kind: "interrupted"; id: string };

export interface ConversationSnapshot {
	blocks: ConversationBlock[];
	title?: string;
	startOffset: number;
	atStart: boolean;
}

export interface ConversationAddress {
	shellId: string;
	agent?: string;
}

export interface ConversationAppendedEvent extends ConversationAddress {
	blocks: ConversationBlock[];
	title?: string;
}

export interface ConversationResetEvent extends ConversationSnapshot, ConversationAddress {}

export interface BankaiConversationApi {
	subscribe: (address: ConversationAddress) => Promise<ConversationSnapshot>;
	history: (address: ConversationAddress, before: number) => Promise<void>;
	unsubscribe: (address: ConversationAddress) => void;
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
