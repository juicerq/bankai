import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import type { TerminalKey } from "@main/terminal/input";
import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { ACTIVITY_DOT_CLASS, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileAttention } from "@renderer/routes/mobile/-components/mobile-attention";
import { MobileAgentNotice, MobileComposer } from "@renderer/routes/mobile/-components/mobile-composer";
import { MobileConversationBlocks } from "@renderer/routes/mobile/-components/mobile-conversation-block";
import type { ConversationView } from "@renderer/routes/mobile/-utils/use-conversation";
import { useStickToBottom } from "@renderer/routes/mobile/-utils/use-stick-to-bottom";

export interface MobileConversationSession {
	row: SessionRow;
	onSend: (text: string) => Promise<void>;
	onKey: (key: TerminalKey) => Promise<void>;
}

function emptyNotice(agent: string | undefined, row: SessionRow | undefined): string {
	if (agent) {
		return "This subagent left no transcript to read.";
	}

	if (row) {
		return "Nothing to read here yet.";
	}

	return "This session is no longer open.";
}

function MobileWaiting({ trace, since }: { trace: string | undefined; since: number | undefined }) {
	return (
		<p data-slot="waiting" className="flex items-center gap-2 px-4 text-support text-tertiary">
			<span aria-hidden="true" className="pending-pulse size-1.5 shrink-0 rounded-full bg-tertiary" />
			<span className="min-w-0 truncate">{trace ?? "Working"}</span>
			{since ? <ElapsedClock since={since} /> : null}
		</p>
	);
}

export function MobileConversation({
	shellId,
	session,
	agent,
	conversation,
	onOpenAgent,
	onBack,
}: {
	shellId: string;
	session: MobileConversationSession | undefined;
	agent?: string;
	conversation: ConversationView;
	onOpenAgent?: (toolUseId: string) => void;
	onBack: () => void;
}) {
	const scroll = useStickToBottom();
	const row = session?.row;
	const waiting = row?.activity === "working" && conversation.blocks.at(-1)?.kind === "user";

	const handleScroll = () => {
		scroll.handleScroll();

		const element = scroll.ref.current;
		if (!element || conversation.atStart || conversation.loadingOlder || element.scrollTop > element.clientHeight) {
			return;
		}

		scroll.keepPosition();
		void conversation.loadOlder();
	};

	return (
		<div
			data-component="mobile-conversation"
			data-shell-id={shellId}
			className="flex h-full flex-col bg-surface"
		>
			<MobileConversationHeader row={row} title={conversation.title ?? agent ?? row?.title} onBack={onBack} />
			<div
				ref={scroll.ref}
				data-slot="scroll"
				onScroll={handleScroll}
				className="min-h-0 flex-1 overflow-y-auto"
			>
				<div ref={scroll.contentRef} data-slot="reading" className="flex flex-col gap-3 py-3">
					{conversation.loadingOlder && (
						<p data-slot="loading-older" className="px-4 text-center text-label text-tertiary">
							<span className="pending-pulse">LOADING OLDER HISTORY</span>
						</p>
					)}
					{conversation.atStart && conversation.blocks.length > 0 && (
						<p data-slot="start" className="px-4 text-center text-label text-outline-strong">
							BEGINNING OF THIS CONVERSATION
						</p>
					)}
					<MobileConversationBlocks blocks={conversation.blocks} onOpenAgent={onOpenAgent} />
					{waiting && <MobileWaiting trace={row.trace} since={row.traceSince} />}
					{conversation.blocks.length === 0 && !conversation.loading && (
						<p data-slot="empty" className="px-4 py-8 text-center text-secondary text-support">
							{emptyNotice(agent, row)}
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
			{session && (session.row.harness
				? (
					<MobileComposer
						working={session.row.activity === "working"}
						onSend={session.onSend}
						onStop={() => session.onKey("escape")}
					/>
				)
				: <MobileAgentNotice since={session.row.createdAt} />)}
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
			<div className="flex min-w-0 flex-1 flex-col pr-2">
				<span data-slot="title" className="truncate text-body text-primary">{title ?? "Session"}</span>
				{row && (
					<span data-slot="meta" className="flex min-w-0 items-center gap-2 text-data">
						{row.activity && (
							<span
								data-slot="activity"
								className={`flex min-w-0 flex-1 items-center gap-1 ${ACTIVITY_TEXT_CLASS[row.activity]}`}
							>
								<span
									aria-hidden="true"
									className={`size-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_CLASS[row.activity]}`}
								/>
								<span className="min-w-0 truncate">{row.trace}</span>
								{row.traceSince ? <ElapsedClock since={row.traceSince} /> : null}
							</span>
						)}
						<span className="max-w-1/3 shrink-0 truncate text-secondary">{row.projectName}</span>
					</span>
				)}
			</div>
		</header>
	);
}
