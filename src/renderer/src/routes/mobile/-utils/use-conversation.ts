import { useMemo, useSyncExternalStore } from "react";
import { conversationStream } from "@renderer/lib/stream/conversation";
import { streamResync } from "@renderer/lib/stream/resync";
import { type ConversationBlock, mergeConversationBlocks } from "@shared/conversation";

export interface ConversationView {
	blocks: ConversationBlock[];
	title: string | undefined;
	truncated: boolean;
	loading: boolean;
}

const LOADING_CONVERSATION: ConversationView = {
	blocks: [],
	title: undefined,
	truncated: false,
	loading: true,
};

export function useConversation(shellId: string): ConversationView {
	const observer = useMemo(() => new ConversationObserver(shellId), [shellId]);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class ConversationObserver {
	private view = LOADING_CONVERSATION;
	private notify: (() => void) | undefined;

	constructor(private readonly shellId: string) {}

	readonly getSnapshot = () => this.view;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;

		const stopAppended = conversationStream.onAppended((event) => {
			if (event.shellId !== this.shellId) {
				return;
			}

			this.set({
				...this.view,
				blocks: mergeConversationBlocks(this.view.blocks, event.blocks),
				title: event.title ?? this.view.title,
			});
		});
		const stopReset = conversationStream.onReset((event) => {
			if (event.shellId !== this.shellId) {
				return;
			}

			this.set({ blocks: event.blocks, title: event.title, truncated: event.truncated, loading: false });
		});
		const stopResync = streamResync.register("watch", () => this.load());

		this.load().catch((err) => console.error("Failed to read the conversation", err));

		return () => {
			stopAppended();
			stopReset();
			stopResync();
			this.notify = undefined;
			conversationStream.unsubscribe(this.shellId);
		};
	};

	private async load() {
		const snapshot = await conversationStream.subscribe(this.shellId);

		this.set({
			blocks: snapshot.blocks,
			title: snapshot.title,
			truncated: snapshot.truncated,
			loading: false,
		});
	}

	private set(view: ConversationView) {
		this.view = view;
		this.notify?.();
	}
}
