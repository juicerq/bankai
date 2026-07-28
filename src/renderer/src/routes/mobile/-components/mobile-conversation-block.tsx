import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ConversationBlock, ConversationEdit, ConversationToolState } from "@shared/conversation";

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

function EditCounts({ edit }: { edit: ConversationEdit }) {
	return (
		<span data-slot="edit" className="ml-auto shrink-0 tabular-nums">
			<span className="text-added">+{edit.added}</span>
			<span className="text-removed"> −{edit.removed}</span>
		</span>
	);
}

function ThinkingBlock({ text }: { text: string }) {
	const [open, setOpen] = useState(false);

	return (
		<button
			type="button"
			data-component="conversation-block"
			data-kind="thinking"
			data-open={String(open)}
			aria-expanded={open}
			onClick={() => setOpen(!open)}
			className="mx-4 flex flex-col items-start gap-1 border-outline border-l pl-2 text-left text-secondary text-support"
		>
			<span data-slot="thinking-mark" className="text-label text-outline-strong">THINKING</span>
			<span
				data-slot="thinking-text"
				className={`min-w-0 whitespace-pre-wrap break-words ${open ? "" : "line-clamp-1"}`}
			>
				{text}
			</span>
		</button>
	);
}

function ToolBlock({
	block,
	onOpenAgent,
}: {
	block: Extract<ConversationBlock, { kind: "tool" }>;
	onOpenAgent: ((toolUseId: string) => void) | undefined;
}) {
	const inside = (
		<>
			<span
				data-slot="tool-dot"
				aria-hidden="true"
				className={`size-1.5 shrink-0 rounded-full ${TOOL_DOT_CLASS[block.state]}`}
			/>
			<span className="min-w-0 truncate">{block.label}</span>
			{block.edit && <EditCounts edit={block.edit} />}
		</>
	);
	const shape = `mx-4 flex items-center gap-2 border-outline border-l pl-2 text-left text-support ${
		TOOL_TEXT_CLASS[block.state]
	}`;

	if (!block.agent || !onOpenAgent) {
		return (
			<div data-component="conversation-block" data-kind="tool" data-state={block.state} className={shape}>
				{inside}
			</div>
		);
	}

	return (
		<button
			type="button"
			data-component="conversation-block"
			data-kind="tool"
			data-state={block.state}
			data-slot="open-agent"
			onClick={() => onOpenAgent(block.id)}
			className={`${shape} active:text-primary`}
		>
			{inside}
			<ChevronRightIcon className={`size-3 shrink-0 ${block.edit ? "ml-1" : "ml-auto"}`} aria-hidden="true" />
		</button>
	);
}

export function MobileConversationBlock({
	block,
	onOpenAgent,
}: {
	block: ConversationBlock;
	onOpenAgent?: (toolUseId: string) => void;
}) {
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

	if (block.kind === "thinking") {
		return <ThinkingBlock text={block.text} />;
	}

	if (block.kind === "tool") {
		return <ToolBlock block={block} onOpenAgent={onOpenAgent} />;
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
