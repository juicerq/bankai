import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ConversationBlock, ConversationEdit, ConversationToolState } from "@shared/conversation";

type ToolBlock = Extract<ConversationBlock, { kind: "tool" }>;

type ConversationRun =
	| { kind: "tools"; id: string; tools: ToolBlock[] }
	| { kind: "single"; id: string; block: Exclude<ConversationBlock, { kind: "tool" }> };

const TOOL_DOT_CLASS: Record<ConversationToolState, string> = {
	running: "pending-pulse size-2 border border-tertiary bg-surface",
	done: "size-1.5 bg-outline-strong",
	failed: "size-1.5 bg-removed",
};

const TOOL_TEXT_CLASS: Record<ConversationToolState, string> = {
	running: "text-primary",
	done: "text-secondary",
	failed: "text-removed",
};

function conversationRuns(blocks: ConversationBlock[]): ConversationRun[] {
	const runs: ConversationRun[] = [];

	for (const block of blocks) {
		const last = runs.at(-1);

		if (block.kind !== "tool") {
			runs.push({ kind: "single", id: block.id, block });

			continue;
		}

		if (last?.kind === "tools") {
			last.tools.push(block);

			continue;
		}

		runs.push({ kind: "tools", id: block.id, tools: [block] });
	}

	return runs;
}

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

function ToolStep({
	block,
	onOpenAgent,
}: {
	block: ToolBlock;
	onOpenAgent: ((toolUseId: string) => void) | undefined;
}) {
	const inside = (
		<>
			<span aria-hidden="true" className="flex w-2 shrink-0 justify-center">
				<span data-slot="tool-dot" className={`shrink-0 self-center rounded-full ${TOOL_DOT_CLASS[block.state]}`} />
			</span>
			<span className="min-w-0 truncate">{block.label}</span>
			{block.edit && <EditCounts edit={block.edit} />}
		</>
	);
	const shape = `relative flex items-center gap-2 text-left text-support ${TOOL_TEXT_CLASS[block.state]}`;

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

function ToolTimeline({
	tools,
	onOpenAgent,
}: {
	tools: ToolBlock[];
	onOpenAgent: ((toolUseId: string) => void) | undefined;
}) {
	return (
		<div data-component="tool-timeline" className="relative flex flex-col gap-2 px-4">
			<span aria-hidden="true" className="absolute inset-y-2 left-4 flex w-2 justify-center">
				<span className="w-px bg-outline" />
			</span>
			{tools.map((tool) => <ToolStep key={tool.id} block={tool} onOpenAgent={onOpenAgent} />)}
		</div>
	);
}

export function MobileConversationBlocks({
	blocks,
	onOpenAgent,
}: {
	blocks: ConversationBlock[];
	onOpenAgent?: (toolUseId: string) => void;
}) {
	return (
		<>
			{conversationRuns(blocks).map((run) =>
				run.kind === "tools"
					? <ToolTimeline key={run.id} tools={run.tools} onOpenAgent={onOpenAgent} />
					: <MobileConversationBlock key={run.id} block={run.block} />
			)}
		</>
	);
}

function MobileConversationBlock({ block }: { block: Exclude<ConversationBlock, { kind: "tool" }> }) {
	if (block.kind === "user") {
		return (
			<div
				data-component="conversation-block"
				data-kind="user"
				className="mx-4 border-l-2 border-l-tertiary bg-surface-raised px-3 py-2"
			>
				<span className="whitespace-pre-wrap break-words text-primary text-terminal">{block.text}</span>
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
