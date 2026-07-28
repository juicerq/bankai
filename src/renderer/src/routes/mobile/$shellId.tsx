import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useMobileSurface } from "@renderer/routes/mobile/-utils/mobile-surface-context";

export const Route = createFileRoute("/mobile/$shellId")({ component: MobileConversation });

function MobileConversation() {
	const { shellId } = Route.useParams();
	const { rows } = useMobileSurface();
	const navigate = useNavigate();
	const row = rows.find((entry) => entry.shellId === shellId);

	return (
		<div
			data-component="mobile-conversation"
			data-shell-id={shellId}
			className="flex h-full flex-col bg-surface"
		>
			<MobileConversationHeader row={row} onBack={() => navigate({ to: "/mobile" })} />
			<div className="min-h-0 flex-1 overflow-y-auto">
				{!row && (
					<p data-slot="missing" className="px-4 py-8 text-center text-secondary text-support">
						This session is no longer open.
					</p>
				)}
			</div>
		</div>
	);
}

function MobileConversationHeader({ row, onBack }: { row: SessionRow | undefined; onBack: () => void }) {
	return (
		<header className="flex h-header shrink-0 items-center gap-1 border-b border-outline px-2">
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
				<span className="truncate text-body text-primary">{row?.title ?? "Session"}</span>
				{row && <span className="truncate text-data text-secondary">{row.projectName}</span>}
			</div>
			{row?.activity && (
				<span
					data-slot="activity"
					aria-hidden="true"
					className={`mr-2 size-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_CLASS[row.activity]}`}
				/>
			)}
		</header>
	);
}
