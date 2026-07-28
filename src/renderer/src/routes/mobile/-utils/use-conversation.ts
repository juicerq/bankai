import { useMemo, useSyncExternalStore } from "react";
import { conversationStream } from "@renderer/lib/stream/conversation";
import { streamResync } from "@renderer/lib/stream/resync";
import { type ConversationAddress, type ConversationBlock, mergeConversationBlocks } from "@shared/conversation";

export interface ConversationView {
	blocks: ConversationBlock[];
	title: string | undefined;
	atStart: boolean;
	loading: boolean;
	loadingOlder: boolean;
	loadOlder: () => Promise<void>;
}

export function useConversation(shellId: string, agent?: string): ConversationView {
	const observer = useMemo(() => new ConversationObserver(agent ? { shellId, agent } : { shellId }), [shellId, agent]);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class ConversationObserver {
	private cursor = 0;
	private older: Promise<void> | undefined;
	private notify: (() => void) | undefined;

	private readonly loadOlder = async (): Promise<void> => {
		if (this.older || this.view.loading || this.view.atStart || this.cursor <= 0) {
			return;
		}

		this.set({ ...this.view, loadingOlder: true });
		this.older = conversationStream.history(this.address, this.cursor);

		try {
			await this.older;
		} finally {
			this.older = undefined;
			this.set({ ...this.view, loadingOlder: false });
		}
	};

	private view: ConversationView = {
		blocks: [],
		title: undefined,
		atStart: false,
		loading: true,
		loadingOlder: false,
		loadOlder: this.loadOlder,
	};

	constructor(private readonly address: ConversationAddress) {}

	readonly getSnapshot = () => this.view;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;

		const stopAppended = conversationStream.onAppended((event) => {
			if (!this.addressed(event)) {
				return;
			}

			this.set({
				...this.view,
				blocks: mergeConversationBlocks(this.view.blocks, event.blocks),
				title: event.title ?? this.view.title,
			});
		});
		const stopReset = conversationStream.onReset((event) => {
			if (!this.addressed(event)) {
				return;
			}

			this.cursor = event.startOffset;
			this.set({
				...this.view,
				blocks: event.blocks,
				title: event.title,
				atStart: event.atStart,
				loading: false,
			});
		});
		const stopResync = streamResync.register("watch", () => this.load());

		this.load().catch((err) => console.error("Failed to read the conversation", err));

		return () => {
			stopAppended();
			stopReset();
			stopResync();
			this.notify = undefined;
			conversationStream.unsubscribe(this.address);
		};
	};

	private addressed(event: ConversationAddress): boolean {
		return event.shellId === this.address.shellId && event.agent === this.address.agent;
	}

	private async load() {
		const snapshot = await conversationStream.subscribe(this.address);

		this.cursor = snapshot.startOffset;
		this.set({
			...this.view,
			blocks: snapshot.blocks,
			title: snapshot.title,
			atStart: snapshot.atStart,
			loading: false,
		});
	}

	private set(view: ConversationView) {
		this.view = view;
		this.notify?.();
	}
}
