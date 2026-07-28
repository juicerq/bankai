import type { ConversationBlock, ConversationToolState } from "@shared/conversation";

const TOOL_DOT_CLASS: Record<ConversationToolState, string> = {
	running: "pending-pulse bg-tertiary",
	done: "bg-outline-strong",
	failed: "bg-removed",
};

const TOOL_TEXT_CLASS: Record<ConversationToolState, string> = {
	running: "text-secondary",
	done: "text-secondary",
	failed: "text-removed",
};

export function MobileConversationBlock({ block }: { block: ConversationBlock }) {
	if (block.kind === "user") {
		return (
			<div
				data-component="conversation-block"
				data-kind="user"
				className="mx-3 flex gap-2 border-l-2 border-l-tertiary bg-surface-raised px-3 py-2"
			>
				<span aria-hidden="true" className="shrink-0 text-terminal text-tertiary">❯</span>
				<span className="min-w-0 whitespace-pre-wrap break-words text-primary text-terminal">{block.text}</span>
			</div>
		);
	}

	if (block.kind === "agent") {
		return (
			<p
				data-component="conversation-block"
				data-kind="agent"
				className="whitespace-pre-wrap break-words px-4 text-primary text-terminal"
			>
				{block.text}
			</p>
		);
	}

	if (block.kind === "tool") {
		return (
			<div
				data-component="conversation-block"
				data-kind="tool"
				data-state={block.state}
				className={`mx-4 flex items-center gap-2 border-outline border-l pl-2 text-support ${
					TOOL_TEXT_CLASS[block.state]
				}`}
			>
				<span
					data-slot="tool-dot"
					aria-hidden="true"
					className={`size-1.5 shrink-0 rounded-full ${TOOL_DOT_CLASS[block.state]}`}
				/>
				<span className="min-w-0 truncate">{block.label}</span>
			</div>
		);
	}

	if (block.kind === "compacted") {
		return (
			<div
				data-component="conversation-block"
				data-kind="compacted"
				className="mx-4 flex items-center gap-3 text-outline-strong text-label"
			>
				<span aria-hidden="true" className="h-px flex-1 bg-outline" />
				CONVERSATION COMPACTED
				<span aria-hidden="true" className="h-px flex-1 bg-outline" />
			</div>
		);
	}

	return (
		<div
			data-component="conversation-block"
			data-kind="interrupted"
			className="mx-4 flex items-center gap-2 text-label text-removed"
		>
			<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-removed" />
			INTERRUPTED
		</div>
	);
}
