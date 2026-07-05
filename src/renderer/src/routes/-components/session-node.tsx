import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	type NodeProps,
	NodeResizer,
	type OnResizeEnd,
} from "@xyflow/react";
import { Check } from "lucide-react";
import { useContext } from "react";
import { Terminal } from "@renderer/components/terminal";
import { client, orpc } from "@renderer/lib/api";
import type { SessionFlowNode } from "../-utils/flow-nodes";
import { useResizing } from "../-utils/resize-context";
import { SettledZoomContext } from "../-utils/settled-zoom-context";

const STATUS_STYLE = {
	idle: { label: "ocioso", pill: "bg-olive/10 text-olive", dot: "bg-slime" },
	generating: { label: "gerando", pill: "bg-amber/10 text-amber", dot: "bg-amber" },
	blocked: { label: "bloqueado", pill: "bg-danger/10 text-danger", dot: "bg-danger" },
} as const;

export function SessionNode({ id, data }: NodeProps<SessionFlowNode>) {
	const queryClient = useQueryClient();
	const { resizing, ctx } = useResizing(id);
	const zoom = useContext(SettledZoomContext);
	const status = useQuery(
		orpc.review.status.queryOptions({ input: { sessionId: id } }),
	);
	const unreviewed = useQuery(
		orpc.review.unreviewedCount.queryOptions({ input: { sessionId: id } }),
	);
	const statusValue = status.data ?? "idle";
	const style = STATUS_STYLE[statusValue];
	const unreviewedCount = unreviewed.data ?? 0;

	const invalidateList = () => {
		queryClient.invalidateQueries({ queryKey: orpc.sessions.list.key() });
	};

	const onKill = async () => {
		await client.sessions.kill({ sessionId: id });
		await client.workspace.removeNode({ sessionId: id });
		invalidateList();
	};

	const onResizeEnd: OnResizeEnd = (_e, params) => {
		ctx.endResize(id);
		client.workspace.updateNode({
			sessionId: id,
			x: params.x,
			y: params.y,
			width: params.width,
			height: params.height,
		});
	};

	return (
		<div className="flex h-full w-full flex-col rounded-xl border border-ink/10 bg-panel shadow-lg shadow-ink/10">
			<NodeResizer
				minWidth={320}
				minHeight={240}
				color="#6b9233"
				isVisible={resizing}
				onResizeStart={(_e) => ctx.beginResize(id)}
				onResizeEnd={onResizeEnd}
			/>

			<header className="session-drag-handle flex cursor-grab items-center justify-between gap-3 rounded-t-xl bg-panel px-4 py-2.5 active:cursor-grabbing">
				<div className="min-w-0">
					<p className="truncate font-mono text-[11px] text-ink-muted">
						{data.cwd}
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					<span
						className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] ${style.pill}`}
					>
						<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
						{style.label}
					</span>

					{unreviewedCount > 0 && (
						<span
							title={`${unreviewedCount} turnos não revisados`}
							className="flex items-center gap-1 font-mono text-[11px] text-ink-muted"
						>
							<span className="h-1.5 w-1.5 rounded-full bg-amber" />
							{unreviewedCount}
						</span>
					)}
					{unreviewedCount === 0 && statusValue === "idle" && (
						<Check
							size={13}
							strokeWidth={2}
							className="text-olive/60"
							aria-label="tudo revisado"
						/>
					)}

					<Link
						to="/review/$sessionId"
						params={{ sessionId: id }}
						title="revisar diffs da sessão"
						className="nodrag rounded-lg border border-ink/15 px-2 py-0.5 font-mono text-xs text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
					>
						ver diff
					</Link>

					<button
						type="button"
						onClick={onKill}
						title="encerrar sessão"
						className="nodrag rounded-lg border border-danger/20 px-2 py-0.5 font-mono text-xs text-danger/80 transition-colors hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger focus-visible:outline-none"
					>
						encerrar
					</button>
				</div>
			</header>

			<div className="nodrag nopan nowheel min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-ink/10 bg-paper p-2">
				<Terminal sessionId={id} zoom={zoom} onExit={invalidateList} />
			</div>
		</div>
	);
}
