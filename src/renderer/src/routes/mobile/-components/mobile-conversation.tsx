import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import type { TerminalKey } from "@main/terminal/input";
import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { ACTIVITY_DOT_CLASS, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileAttention } from "@renderer/routes/mobile/-components/mobile-attention";
import { MobileComposer } from "@renderer/routes/mobile/-components/mobile-composer";
import { MobileConversationBlock } from "@renderer/routes/mobile/-components/mobile-conversation-block";
import type { ConversationView } from "@renderer/routes/mobile/-utils/use-conversation";
import { useStickToBottom } from "@renderer/routes/mobile/-utils/use-stick-to-bottom";

export interface MobileConversationSession {
	row: SessionRow;
	onSend: (text: string) => Promise<void>;
	onKey: (key: TerminalKey) => Promise<void>;
}

export function MobileConversation({
	shellId,
	session,
	conversation,
	onBack,
}: {
	shellId: string;
	session: MobileConversationSession | undefined;
	conversation: ConversationView;
	onBack: () => void;
}) {
	const scroll = useStickToBottom();
	const row = session?.row;

	return (
		<div
			data-component="mobile-conversation"
			data-shell-id={shellId}
			className="flex h-full flex-col bg-surface"
		>
			<MobileConversationHeader row={row} title={conversation.title ?? row?.title} onBack={onBack} />
			<div
				ref={scroll.ref}
				data-slot="scroll"
				onScroll={scroll.handleScroll}
				className="min-h-0 flex-1 overflow-y-auto"
			>
				<div ref={scroll.contentRef} data-slot="reading" className="flex flex-col gap-3 py-3">
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
				</div>
			</div>
			{session?.row.activity === "needs-attention" && (
				<MobileAttention
					attention={session.row.attention}
					label={session.row.trace}
					signature={`${session.row.activity} ${session.row.trace} ${session.row.traceSince}`}
					onKey={session.onKey}
				/>
			)}
			{session && (
				<MobileComposer
					working={session.row.activity === "working"}
					live={!!session.row.harness}
					onSend={session.onSend}
					onStop={() => session.onKey("escape")}
				/>
			)}
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
				className="-mx-1.5 flex size-11 shrink-0 items-center justify-center text-secondary active:text-primary"
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
