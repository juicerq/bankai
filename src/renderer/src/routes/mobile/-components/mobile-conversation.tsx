import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { ACTIVITY_DOT_CLASS, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileComposer } from "@renderer/routes/mobile/-components/mobile-composer";
import { MobileConversationBlock } from "@renderer/routes/mobile/-components/mobile-conversation-block";
import type { ConversationView } from "@renderer/routes/mobile/-utils/use-conversation";
import { useStickToBottom } from "@renderer/routes/mobile/-utils/use-stick-to-bottom";

export function MobileConversation({
	shellId,
	row,
	conversation,
	onBack,
	onSend,
	onStop,
}: {
	shellId: string;
	row: SessionRow | undefined;
	conversation: ConversationView;
	onBack: () => void;
	onSend: (text: string) => Promise<void>;
	onStop: () => Promise<void>;
}) {
	const scroll = useStickToBottom();

	return (
		<div
			data-component="mobile-conversation"
			data-shell-id={shellId}
			className="flex h-full flex-col bg-surface"
		>
			<MobileConversationHeader row={row} title={conversation.title ?? row?.title} onBack={onBack} />
			<div
				ref={scroll.ref}
				onScroll={scroll.handleScroll}
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3"
			>
				{conversation.truncated && (
					<p data-slot="truncated" className="px-4 text-center text-label text-outline-strong">
						HISTORY TRUNCATED
					</p>
				)}
				{conversation.blocks.map((block) => <MobileConversationBlock key={block.id} block={block} />)}
				{conversation.blocks.length === 0 && !conversation.loading && (
					<p data-slot="empty" className="px-4 py-8 text-center text-secondary text-support">
						{row ? "Nothing to read here yet." : "This session is no longer open."}
					</p>
				)}
				<div key={conversation.blocks.length} ref={scroll.anchorRef} aria-hidden="true" />
			</div>
			<MobileComposer working={row?.activity === "working"} live={!!row?.harness} onSend={onSend} onStop={onStop} />
		</div>
	);
}

function MobileConversationHeader({
	row,
	title,
	onBack,
}: {
	row: SessionRow | undefined;
	title: string | undefined;
	onBack: () => void;
}) {
	return (
		<header className="flex h-header shrink-0 items-center gap-1 border-outline border-b px-2">
			<button
				type="button"
				data-slot="back"
				aria-label="Back to sessions"
				className="flex size-8 shrink-0 items-center justify-center text-secondary active:text-primary"
				onClick={onBack}
			>
				<ChevronLeftIcon className="size-4" aria-hidden="true" />
			</button>
			<div className="flex min-w-0 flex-1 flex-col">
				<span data-slot="title" className="truncate text-body text-primary">{title ?? "Session"}</span>
				{row && <span className="truncate text-data text-secondary">{row.projectName}</span>}
			</div>
			{row?.activity && (
				<span
					data-slot="activity"
					className={`mr-1 flex min-w-0 max-w-[45%] items-baseline gap-1 text-data ${ACTIVITY_TEXT_CLASS[row.activity]}`}
				>
					<span aria-hidden="true" className={`size-1.5 self-center rounded-full ${ACTIVITY_DOT_CLASS[row.activity]}`} />
					<span className="min-w-0 truncate">{row.trace}</span>
					{row.traceSince ? <ElapsedClock since={row.traceSince} /> : null}
				</span>
			)}
		</header>
	);
}
